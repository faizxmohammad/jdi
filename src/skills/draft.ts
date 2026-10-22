import { SKILL_NAME } from "../catalog/skillFiles.js"

export interface SkillDraftInput {
  name: string
  description: string
  body: string
  triggers?: readonly string[]
  requires?: readonly string[]
  provides?: readonly string[]
  outputs?: string
  entryType?: string
}

export interface SkillDraftResult {
  status: "ok" | "invalid_input"
  persisted: false
  message: string
  markdown?: string
  issues: string[]
}

const ALLOWED_ENTRY = new Set([
  "instruction_skill",
  "reference_collection",
  "cli_integration",
  "plugin_integration",
  "external_mcp",
  "composite_workflow",
])

const quote = (value: string): string => {
  if (/[:#,\[\]\n]/.test(value)) return JSON.stringify(value)
  return value
}

const listField = (key: string, values: readonly string[] | undefined): string | undefined => {
  if (!values || values.length === 0) return undefined
  return `${key}: ${values.map((value) => quote(value.trim())).join(", ")}`
}

/**
 * Build a reviewable SKILL.md. Does not write to the catalog.
 * Human review is required before a file is added under skills/.
 */
export const draftSkillCandidate = (input: SkillDraftInput): SkillDraftResult => {
  const issues: string[] = []
  const name = input.name.trim()
  const description = input.description.trim()
  const body = input.body.trim()
  const entryType = input.entryType?.trim() || "instruction_skill"

  if (!SKILL_NAME.test(name)) issues.push("name must match an existing skill id pattern")
  if (description.length < 12 || description.length > 500) {
    issues.push("description must be 12–500 characters")
  }
  if (body.length < 20 || body.length > 4000) issues.push("body must be 20–4000 characters")
  if (!ALLOWED_ENTRY.has(entryType)) issues.push(`unsupported entryType: ${entryType}`)
  for (const phrase of input.triggers ?? []) {
    if (phrase.trim().length < 2 || phrase.trim().length > 80) {
      issues.push(`invalid trigger: ${phrase}`)
    }
  }

  if (issues.length > 0) {
    return {
      status: "invalid_input",
      persisted: false,
      message: "Draft rejected. Nothing was written.",
      issues,
    }
  }

  const lines = [
    "---",
    `name: ${name}`,
    `description: ${quote(description)}`,
    `entryType: ${entryType}`,
    listField("triggers", input.triggers),
    listField("requires", input.requires),
    listField("provides", input.provides),
    input.outputs?.trim() ? `outputs: ${quote(input.outputs.trim())}` : undefined,
    "version: 0.1.0",
    "validationStatus: needs_review",
    "sourceId: just-do-it-local",
    "---",
    "",
    body,
    "",
  ].filter((line): line is string => line !== undefined)

  return {
    status: "ok",
    persisted: false,
    message: "Draft only. Review the markdown, then add it through the import gate. This call did not write a file.",
    markdown: lines.join("\n"),
    issues: [],
  }
}
