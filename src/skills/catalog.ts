import { promises as fs } from "node:fs"
import path from "node:path"
import { config } from "../config.js"
import { evaluateImportGate, findSourceById } from "../catalog/importPolicy.js"
import { loadSourceManifest } from "../catalog/manifest.js"
import {
  parseSkillRecord,
  parseSkillSummary,
  type SkillProvenance,
  type SkillRecord,
  type SkillSummary,
  type SourceManifest,
} from "../catalog/schema.js"
import {
  SKILL_NAME,
  listSkillDirectories,
  readSkillFile,
  type ParsedSkillFile,
} from "../catalog/skillFiles.js"
import { SERVER_VERSION } from "../version.js"
import { loadExternalRegistry, isProxyEnabled } from "../integrations/registry.js"
import { buildCapabilityPlan, type CapabilityPlan } from "./plan.js"
import {
  recommendSkills,
  type RecommendOptions,
  type RecommendResult,
} from "./recommend.js"

export type { SkillRecord, SkillSummary }
export type { RecommendOptions, RecommendResult }
export type { CapabilityPlan }

export interface CatalogOptions {
  catalogPath?: string
  maxSkillBytes?: number
  manifest?: SourceManifest
  manifestPath?: string
}

export interface SearchOptions {
  query?: string
  limit?: number
  category?: string | undefined
}

export class SkillCatalog {
  private readonly catalogPath: string
  private readonly maxSkillBytes: number
  private readonly manifestPath: string | undefined
  private readonly injectedManifest: SourceManifest | undefined
  private manifestCache: SourceManifest | undefined
  /** In-process summary index so search avoids re-reading every call; never returned as full bodies. */
  private summaryIndex: SkillSummary[] | undefined

  constructor(options: CatalogOptions = {}) {
    this.catalogPath = path.resolve(options.catalogPath ?? config.catalogPath)
    this.maxSkillBytes = options.maxSkillBytes ?? config.JUST_DO_IT_MAX_SKILL_BYTES
    this.injectedManifest = options.manifest
    this.manifestPath = options.manifestPath
  }

  private async getManifest(): Promise<SourceManifest> {
    if (this.injectedManifest) return this.injectedManifest
    if (this.manifestCache) return this.manifestCache
    // Fail closed: never serve catalog content without a loadable source manifest.
    this.manifestCache = await loadSourceManifest(this.manifestPath)
    return this.manifestCache
  }

  private async catalogVersion(): Promise<string> {
    try {
      return (await fs.readFile(path.join(this.catalogPath, "VERSION"), "utf8")).trim() || "unversioned"
    } catch {
      return "unversioned"
    }
  }

  private async provenanceFor(skill: ParsedSkillFile): Promise<SkillProvenance> {
    const manifest = await this.getManifest()
    const source = findSourceById(manifest.sources, skill.sourceId)
    if (!source) {
      throw new Error(`Unknown sourceId for skill ${skill.id}: ${skill.sourceId}`)
    }
    const commitOrRelease = source.commitOrRelease ?? skill.version
    const attribution = source.licenseNotes

    const provenance: SkillProvenance = {
      sourceId: skill.sourceId,
      sourcePath: `skills/${skill.id}/SKILL.md`,
      commitOrRelease,
      license: source.license,
    }
    if (source.sourceUrl) provenance.sourceUrl = source.sourceUrl
    if (attribution) provenance.attribution = attribution
    return provenance
  }

  private async toSummary(skill: ParsedSkillFile): Promise<SkillSummary> {
    const summary: {
      id: string
      name: string
      description: string
      entryType: ParsedSkillFile["entryType"]
      tags: string[]
      triggers: string[]
      requires: string[]
      provides: string[]
      outputs?: string
      category?: string
      version: string
      validationStatus: ParsedSkillFile["validationStatus"]
      provenance: SkillProvenance
    } = {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      entryType: skill.entryType,
      tags: skill.tags,
      triggers: skill.triggers,
      requires: skill.requires,
      provides: skill.provides,
      ...(skill.outputs ? { outputs: skill.outputs } : {}),
      version: skill.version,
      validationStatus: skill.validationStatus,
      provenance: await this.provenanceFor(skill),
    }
    if (skill.category) summary.category = skill.category
    return parseSkillSummary(summary)
  }

  private matchesQuery(summary: SkillSummary, needle: string, category?: string): boolean {
    if (category && summary.category?.toLocaleLowerCase("en-US") !== category.toLocaleLowerCase("en-US")) {
      return false
    }
    if (!needle) return true
    const haystack = [
      summary.id,
      summary.name,
      summary.description,
      summary.category ?? "",
      summary.tags.join(" "),
      summary.triggers.join(" "),
      summary.requires.join(" "),
      summary.provides.join(" "),
      summary.outputs ?? "",
      summary.entryType,
      summary.provenance.sourceId ?? "",
    ]
      .join(" ")
      .toLocaleLowerCase("en-US")
    return haystack.includes(needle)
  }

  private async buildSummaryIndex(): Promise<SkillSummary[]> {
    if (this.summaryIndex) return this.summaryIndex

    const catalogVersion = await this.catalogVersion()
    const summaries: SkillSummary[] = []

    const manifest = await this.getManifest()

    for (const skillId of await listSkillDirectories(this.catalogPath)) {
      try {
        const { skill, issues } = await readSkillFile(this.catalogPath, skillId, {
          maxSkillBytes: this.maxSkillBytes,
          catalogVersion,
        })
        if (!skill) continue
        if (
          issues.some(
            (issue) =>
              issue.code === "missing_name" ||
              issue.code === "missing_description" ||
              issue.code === "missing_sourceId",
          )
        ) {
          continue
        }
        const gate = evaluateImportGate(findSourceById(manifest.sources, skill.sourceId))
        if (!gate.allowed) continue
        summaries.push(await this.toSummary(skill))
      } catch {
        // skip unreadable / invalid metadata entries
      }
    }

    this.summaryIndex = summaries
    return summaries
  }

  /** Drop cached summaries after external catalog mutations (tests / import CLI). */
  invalidateIndex(): void {
    this.summaryIndex = undefined
  }

  async search(queryOrOptions: string | SearchOptions = "", limit = 20): Promise<SkillSummary[]> {
    const options: SearchOptions =
      typeof queryOrOptions === "string"
        ? { query: queryOrOptions, limit }
        : queryOrOptions

    const safeLimit = Math.max(1, Math.min(Math.trunc(options.limit ?? 20), 50))
    const needle = (options.query ?? "").trim().toLocaleLowerCase("en-US")
    const results: SkillSummary[] = []

    for (const summary of await this.buildSummaryIndex()) {
      if (this.matchesQuery(summary, needle, options.category)) {
        results.push(summary)
        if (results.length >= safeLimit) break
      }
    }
    return results
  }

  /**
   * Recommend skills for a natural-language task using inspectable metadata/keyword ranking.
   * Only import-gate-allowed catalog entries are considered.
   */
  async recommend(options: RecommendOptions): Promise<RecommendResult> {
    const candidates = await this.buildSummaryIndex()
    return recommendSkills(candidates, options)
  }

  /**
   * Select skills, name the tools they require, and decide which bodies fit the context budget.
   * Does not execute skill scripts or external tools.
   */
  async plan(
    options: RecommendOptions & { contextBudgetBytes?: number },
  ): Promise<CapabilityPlan> {
    const recommendation = await this.recommend(options)
    const bodies = []
    for (const item of recommendation.recommendations) {
      try {
        const record = await this.read(item.skill.id)
        bodies.push({ id: item.skill.id, bytes: record.bytes })
      } catch {
        bodies.push({ id: item.skill.id, bytes: 0 })
      }
    }
    let capabilities: ReturnType<typeof loadExternalRegistry>["capabilities"] = []
    try {
      capabilities = loadExternalRegistry().capabilities
    } catch {
      capabilities = []
    }
    const planOptions: Parameters<typeof buildCapabilityPlan>[0] = {
      recommendation,
      bodies,
      capabilities,
      proxyEnabled: isProxyEnabled(process.env),
    }
    if (options.contextBudgetBytes !== undefined) {
      planOptions.contextBudgetBytes = options.contextBudgetBytes
    }
    return buildCapabilityPlan(planOptions)
  }

  async read(skillName: string, version?: string): Promise<SkillRecord> {
    if (!SKILL_NAME.test(skillName)) throw new Error("Invalid skill name")

    const catalogVersion = await this.catalogVersion()
    const { skill, issues } = await readSkillFile(this.catalogPath, skillName, {
      maxSkillBytes: this.maxSkillBytes,
      catalogVersion,
    })

    if (!skill) {
      if (issues.some((issue) => issue.code === "size_limit")) {
        throw new Error("Skill exceeds configured size limit")
      }
      throw new Error(`Skill not found: ${skillName}`)
    }

    if (issues.some((issue) => issue.code === "size_limit")) {
      throw new Error("Skill exceeds configured size limit")
    }

    const manifest = await this.getManifest()
    const gate = evaluateImportGate(findSourceById(manifest.sources, skill.sourceId))
    if (!gate.allowed) {
      throw new Error(`Skill not found: ${skillName}`)
    }

    const summary = await this.toSummary(skill)
    if (version !== undefined && version !== summary.version) {
      throw new Error(
        `Version mismatch for ${skillName}: requested ${version}, available ${summary.version}`,
      )
    }

    return parseSkillRecord({
      ...summary,
      content: skill.content,
      sha256: skill.sha256,
      bytes: skill.bytes,
    })
  }

  async version(): Promise<{ catalogVersion: string; serverVersion: string; capabilities: string[] }> {
    return {
      catalogVersion: await this.catalogVersion(),
      serverVersion: SERVER_VERSION,
      capabilities: [
        "search_skills",
        "get_skill",
        "recommend_skills",
        "plan_capabilities",
        "list_external_capabilities",
        "call_external_capability",
        "draft_skill_candidate",
        "get_project_context",
        "save_project_context",
        "search_project_memory",
        "list_project_memory",
        "delete_project_memory",
        "export_project_memory",
        "just_do_it_version",
        "skill_sync_cli",
      ],
    }
  }
}
