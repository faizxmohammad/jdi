import { promises as fs } from "node:fs"
import path from "node:path"
import { runCatalogDiagnostics, type CatalogDiagnosticsReport } from "./diagnostics.js"
import { evaluateImportGate, findSourceById } from "./importPolicy.js"
import { loadSourceManifest } from "./manifest.js"
import {
  SKILL_NAME,
  digestContent,
  listSkillDirectories,
  readSkillFile,
  type SkillParseIssue,
} from "./skillFiles.js"

export interface ImportCommandOptions {
  sourceId: string
  from: string
  catalog: string
  check: boolean
  maxSkillBytes?: number
  manifestPath?: string
}

export interface ImportCommandResult {
  ok: boolean
  action: "check" | "import" | "blocked" | "invalid"
  sourceId: string
  skillId?: string
  sha256?: string
  bytes?: number
  version?: string
  provenance?: {
    sourceId: string
    sourceUrl: string
    license: string
    commitOrRelease: string
    attribution?: string
  }
  issues?: SkillParseIssue[]
  duplicateDigest?: "none" | "identical" | "id_collision"
  gate?: { allowed: boolean; reasons: string[] }
  written?: boolean
  target?: string
  note?: string
  reasons?: string[]
  hint?: string
  message?: string
}

const collectConflictIssues = async (
  catalogPath: string,
  skillId: string,
  name: string,
  sha256: string,
): Promise<SkillParseIssue[]> => {
  const issues: SkillParseIssue[] = []
  const nameNeedle = name.toLocaleLowerCase("en-US")

  for (const existingId of await listSkillDirectories(catalogPath)) {
    if (existingId === skillId) continue
    const { skill } = await readSkillFile(catalogPath, existingId)
    if (!skill) continue
    if (skill.name.toLocaleLowerCase("en-US") === nameNeedle) {
      issues.push({
        code: "duplicate_name",
        message: `Name "${name}" already used by skill ${existingId}`,
      })
    }
    if (skill.sha256 === sha256) {
      issues.push({
        code: "duplicate_digest",
        message: `Identical content already present as skill ${existingId}`,
      })
    }
  }

  return issues
}

export const diagnoseCatalog = async (options: {
  catalog: string
  maxSkillBytes?: number
  manifestPath?: string
}): Promise<CatalogDiagnosticsReport> => {
  const diagOptions: {
    catalogPath: string
    maxSkillBytes?: number
    manifestPath?: string
  } = { catalogPath: options.catalog }
  if (options.maxSkillBytes !== undefined) diagOptions.maxSkillBytes = options.maxSkillBytes
  if (options.manifestPath !== undefined) diagOptions.manifestPath = options.manifestPath
  return runCatalogDiagnostics(diagOptions)
}

export const runImportSkill = async (options: ImportCommandOptions): Promise<ImportCommandResult> => {
  const manifest = await loadSourceManifest(options.manifestPath)
  const source = findSourceById(manifest.sources, options.sourceId)
  const gate = evaluateImportGate(source)
  if (!gate.allowed) {
    return {
      ok: false,
      action: "blocked",
      sourceId: options.sourceId,
      reasons: gate.reasons,
      hint: "Do not import until importStatus is approved_for_import (or imported) with a known license and pin.",
      gate,
    }
  }

  const fromPath = path.resolve(options.from)
  const skillId = path.basename(fromPath)
  if (!SKILL_NAME.test(skillId)) {
    return {
      ok: false,
      action: "invalid",
      sourceId: options.sourceId,
      message: `Derived skill id "${skillId}" is invalid; rename the directory`,
    }
  }

  const stagingRoot = path.dirname(fromPath)
  const readOptions: { maxSkillBytes?: number } = {}
  if (options.maxSkillBytes !== undefined) readOptions.maxSkillBytes = options.maxSkillBytes
  const { skill, issues } = await readSkillFile(stagingRoot, skillId, readOptions)

  if (!skill) {
    return {
      ok: false,
      action: "invalid",
      sourceId: options.sourceId,
      skillId,
      issues,
    }
  }

  if (skill.sourceId !== options.sourceId) {
    issues.push({
      code: "source_mismatch",
      message: `Frontmatter sourceId (${skill.sourceId}) does not match --source (${options.sourceId})`,
    })
  }

  const targetDir = path.join(options.catalog, skillId)
  const targetFile = path.join(targetDir, "SKILL.md")
  const existing = await fs.readFile(targetFile, "utf8").catch(() => undefined)
  let duplicateDigest: "none" | "identical" | "id_collision" = "none"
  if (existing !== undefined) {
    duplicateDigest =
      digestContent(existing) === skill.sha256 ? "identical" : "id_collision"
    if (duplicateDigest === "id_collision") {
      issues.push({
        code: "id_collision",
        message: `Skill id ${skillId} already exists with different content`,
      })
    }
  }

  issues.push(...(await collectConflictIssues(options.catalog, skillId, skill.name, skill.sha256)))

  const blocking = issues.filter(
    (issue) =>
      issue.code !== "invalid_entry_type" && issue.code !== "invalid_validation_status",
  )

  const attribution = source!.licenseNotes
  const provenance = {
    sourceId: source!.id,
    sourceUrl: source!.sourceUrl,
    license: source!.license,
    commitOrRelease: source!.commitOrRelease ?? skill.version,
    ...(attribution ? { attribution } : {}),
  }

  const base: ImportCommandResult = {
    ok: blocking.length === 0,
    action: options.check ? "check" : "import",
    sourceId: options.sourceId,
    skillId,
    sha256: skill.sha256,
    bytes: skill.bytes,
    version: skill.version,
    provenance,
    issues,
    duplicateDigest,
    gate,
  }

  if (!base.ok) return base

  if (options.check) {
    return { ...base, written: false }
  }

  if (duplicateDigest === "identical") {
    return { ...base, written: false, note: "already present" }
  }

  await fs.mkdir(targetDir, { recursive: true })
  await fs.writeFile(targetFile, skill.content, "utf8")
  return { ...base, written: true, target: targetFile }
}
