import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"
import { frontmatterList, frontmatterString, parseFrontmatter } from "./frontmatter.js"
import {
  catalogEntryTypeSchema,
  validationStatusSchema,
  type CatalogEntryType,
  type ValidationStatus,
} from "./schema.js"

export const SKILL_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/

export interface ParsedSkillFile {
  id: string
  filePath: string
  content: string
  sha256: string
  bytes: number
  name: string
  description: string
  entryType: CatalogEntryType
  tags: string[]
  triggers: string[]
  requires: string[]
  provides: string[]
  outputs?: string
  category?: string
  version: string
  validationStatus: ValidationStatus
  sourceId: string
}

export interface SkillParseIssue {
  code: string
  message: string
}

export const digestContent = (content: string): string =>
  createHash("sha256").update(content, "utf8").digest("hex")

export const listSkillDirectories = async (catalogPath: string): Promise<string[]> => {
  let entries
  try {
    entries = await fs.readdir(catalogPath, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }

  const names: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    if (!SKILL_NAME.test(entry.name)) continue
    names.push(entry.name)
  }
  return names.sort((a, b) => a.localeCompare(b))
}

export const readSkillFile = async (
  catalogPath: string,
  skillId: string,
  options: { maxSkillBytes?: number; catalogVersion?: string } = {},
): Promise<{ skill?: ParsedSkillFile; issues: SkillParseIssue[] }> => {
  const issues: SkillParseIssue[] = []
  if (!SKILL_NAME.test(skillId)) {
    return { issues: [{ code: "invalid_id", message: `Invalid skill id: ${skillId}` }] }
  }

  const base = path.resolve(catalogPath)
  const directory = path.resolve(base, skillId)
  if (!directory.startsWith(`${base}${path.sep}`)) {
    return { issues: [{ code: "path_escape", message: `Skill path escapes catalog: ${skillId}` }] }
  }

  const dirStat = await fs.lstat(directory).catch(() => undefined)
  if (!dirStat?.isDirectory() || dirStat.isSymbolicLink()) {
    return { issues: [{ code: "not_found", message: `Skill directory missing or symlink: ${skillId}` }] }
  }

  const filePath = path.join(directory, "SKILL.md")
  const stat = await fs.lstat(filePath).catch(() => undefined)
  if (!stat?.isFile() || stat.isSymbolicLink()) {
    return { issues: [{ code: "missing_skill_md", message: `SKILL.md missing or symlink: ${skillId}` }] }
  }

  if (options.maxSkillBytes !== undefined && stat.size > options.maxSkillBytes) {
    issues.push({
      code: "size_limit",
      message: `Skill exceeds size limit (${stat.size} > ${options.maxSkillBytes})`,
    })
  }

  const realBase = await fs.realpath(base)
  const realFile = await fs.realpath(filePath)
  if (!realFile.startsWith(`${realBase}${path.sep}`)) {
    return { issues: [{ code: "realpath_escape", message: `Skill realpath escapes catalog: ${skillId}` }] }
  }

  const content = await fs.readFile(filePath, "utf8")
  const { data } = parseFrontmatter(content)
  const name = frontmatterString(data, "name")
  const description = frontmatterString(data, "description")
  if (!name) issues.push({ code: "missing_name", message: "Frontmatter missing name" })
  if (!description) {
    issues.push({ code: "missing_description", message: "Frontmatter missing description" })
  }

  const entryTypeRaw = frontmatterString(data, "entryType") ?? "instruction_skill"
  const entryParsed = catalogEntryTypeSchema.safeParse(entryTypeRaw)
  if (!entryParsed.success) {
    issues.push({ code: "invalid_entry_type", message: `Invalid entryType: ${entryTypeRaw}` })
  }

  const validationRaw = frontmatterString(data, "validationStatus") ?? "validated"
  const validationParsed = validationStatusSchema.safeParse(validationRaw)
  if (!validationParsed.success) {
    issues.push({
      code: "invalid_validation_status",
      message: `Invalid validationStatus: ${validationRaw}`,
    })
  }

  const category = frontmatterString(data, "category")
  const outputs = frontmatterString(data, "outputs")
  const version =
    frontmatterString(data, "version") ?? options.catalogVersion ?? "unversioned"
  const sourceId = frontmatterString(data, "sourceId")
  if (!sourceId) {
    issues.push({
      code: "missing_sourceId",
      message: "Frontmatter missing sourceId (required; do not infer just-do-it-local)",
    })
  }

  if (
    issues.some(
      (issue) =>
        issue.code === "missing_name" ||
        issue.code === "missing_description" ||
        issue.code === "missing_sourceId",
    )
  ) {
    return { issues }
  }

  return {
    skill: {
      id: skillId,
      filePath,
      content,
      sha256: digestContent(content),
      bytes: Buffer.byteLength(content, "utf8"),
      name: name!,
      description: description!,
      entryType: entryParsed.success ? entryParsed.data : "instruction_skill",
      tags: frontmatterList(data, "tags"),
      triggers: frontmatterList(data, "triggers"),
      requires: frontmatterList(data, "requires"),
      provides: frontmatterList(data, "provides"),
      ...(outputs ? { outputs } : {}),
      ...(category ? { category } : {}),
      version,
      validationStatus: validationParsed.success ? validationParsed.data : "unvalidated",
      sourceId: sourceId!,
    },
    issues,
  }
}
