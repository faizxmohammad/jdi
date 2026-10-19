import { promises as fs } from "node:fs"
import path from "node:path"
import { evaluateImportGate, findSourceById } from "./importPolicy.js"
import { loadSourceManifest } from "./manifest.js"
import type { SourceManifest } from "./schema.js"
import { listSkillDirectories, readSkillFile, type SkillParseIssue } from "./skillFiles.js"

export type DiagnosticSeverity = "error" | "warning" | "info"

export interface DiagnosticFinding {
  severity: DiagnosticSeverity
  code: string
  message: string
  skillId?: string
  sourceId?: string
}

export interface CatalogDiagnosticsReport {
  catalogPath: string
  skillCount: number
  findings: DiagnosticFinding[]
  duplicates: {
    byName: Array<{ name: string; skillIds: string[] }>
    byDigest: Array<{ sha256: string; skillIds: string[] }>
  }
  ok: boolean
}

export interface DiagnosticsOptions {
  catalogPath: string
  manifest?: SourceManifest
  manifestPath?: string
  maxSkillBytes?: number
}

const catalogVersionOf = async (catalogPath: string): Promise<string> => {
  try {
    return (await fs.readFile(path.join(catalogPath, "VERSION"), "utf8")).trim() || "unversioned"
  } catch {
    return "unversioned"
  }
}

export const runCatalogDiagnostics = async (
  options: DiagnosticsOptions,
): Promise<CatalogDiagnosticsReport> => {
  const catalogPath = path.resolve(options.catalogPath)
  const manifest =
    options.manifest ?? (await loadSourceManifest(options.manifestPath))
  const catalogVersion = await catalogVersionOf(catalogPath)
  const findings: DiagnosticFinding[] = []

  for (const source of manifest.sources) {
    if (source.importStatus === "imported" && source.license === "unknown") {
      findings.push({
        severity: "error",
        code: "imported_unknown_license",
        message: `${source.id}: marked imported but license is unknown`,
        sourceId: source.id,
      })
    }
    if (source.importStatus === "approved_for_import") {
      const gate = evaluateImportGate(source)
      if (!gate.allowed) {
        findings.push({
          severity: "warning",
          code: "approved_incomplete",
          message: `${source.id}: approved_for_import but gate fails: ${gate.reasons.join("; ")}`,
          sourceId: source.id,
        })
      }
    }
  }

  const skillIds = await listSkillDirectories(catalogPath)
  const nameMap = new Map<string, string[]>()
  const digestMap = new Map<string, string[]>()

  for (const skillId of skillIds) {
    const readOptions: { maxSkillBytes?: number; catalogVersion?: string } = {
      catalogVersion,
    }
    if (options.maxSkillBytes !== undefined) {
      readOptions.maxSkillBytes = options.maxSkillBytes
    }
    const { skill, issues } = await readSkillFile(catalogPath, skillId, readOptions)

    for (const issue of issues) {
      findings.push(issueToFinding(skillId, issue))
    }

    if (!skill) continue

    const source = findSourceById(manifest.sources, skill.sourceId)
    const gate = evaluateImportGate(source)
    if (!gate.allowed) {
      findings.push({
        severity: "error",
        code: "unauthorized_source",
        message: `Skill ${skillId} sourceId=${skill.sourceId} is not allowed: ${gate.reasons.join("; ")}`,
        skillId,
        sourceId: skill.sourceId,
      })
    }

    const nameKey = skill.name.toLocaleLowerCase("en-US")
    const nameIds = nameMap.get(nameKey) ?? []
    nameIds.push(skillId)
    nameMap.set(nameKey, nameIds)

    const digestIds = digestMap.get(skill.sha256) ?? []
    digestIds.push(skillId)
    digestMap.set(skill.sha256, digestIds)
  }

  const byName = [...nameMap.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([name, ids]) => ({ name, skillIds: ids }))
  const byDigest = [...digestMap.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([sha256, ids]) => ({ sha256, skillIds: ids }))

  for (const dup of byName) {
    findings.push({
      severity: "error",
      code: "duplicate_name",
      message: `Duplicate skill name "${dup.name}" in: ${dup.skillIds.join(", ")}`,
    })
  }
  for (const dup of byDigest) {
    findings.push({
      severity: "error",
      code: "duplicate_digest",
      message: `Duplicate content digest ${dup.sha256.slice(0, 12)}… in: ${dup.skillIds.join(", ")}`,
    })
  }

  const errors = findings.filter((f) => f.severity === "error")
  return {
    catalogPath,
    skillCount: skillIds.length,
    findings,
    duplicates: { byName, byDigest },
    ok: errors.length === 0,
  }
}

const issueToFinding = (skillId: string, issue: SkillParseIssue): DiagnosticFinding => {
  const warningCodes = new Set(["invalid_entry_type", "invalid_validation_status"])
  return {
    severity: warningCodes.has(issue.code) ? "warning" : "error",
    code: issue.code,
    message: `${skillId}: ${issue.message}`,
    skillId,
  }
}
