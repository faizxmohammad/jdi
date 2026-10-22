import { z } from "zod"

/** Catalog entry kinds from docs/implementation.md §4.2 */
export const catalogEntryTypeSchema = z.enum([
  "instruction_skill",
  "reference_collection",
  "cli_integration",
  "plugin_integration",
  "external_mcp",
  "composite_workflow",
])

export type CatalogEntryType = z.infer<typeof catalogEntryTypeSchema>

export const validationStatusSchema = z.enum([
  "validated",
  "unvalidated",
  "rejected",
  "needs_review",
])

export type ValidationStatus = z.infer<typeof validationStatusSchema>

export const skillProvenanceSchema = z.object({
  sourceId: z.string().min(1).max(120).optional(),
  sourceUrl: z.string().url().optional(),
  sourcePath: z.string().max(500).optional(),
  commitOrRelease: z.string().max(120).optional(),
  license: z.string().max(120).optional(),
  attribution: z.string().max(500).optional(),
})

export type SkillProvenance = z.infer<typeof skillProvenanceSchema>

export const skillSummarySchema = z.object({
  id: z.string().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(2000),
  entryType: catalogEntryTypeSchema.default("instruction_skill"),
  tags: z.array(z.string().min(1).max(40)).max(30).default([]),
  /** Declared phrases that select this skill. Matching is exact substring, not a global synonym table. */
  triggers: z.array(z.string().min(1).max(80)).max(20).default([]),
  /** Capability ids this skill expects (external MCP, CLI, or another catalog capability). */
  requires: z.array(z.string().min(1).max(80)).max(20).default([]),
  /** Capability ids this skill contributes to a workflow. */
  provides: z.array(z.string().min(1).max(80)).max(20).default([]),
  /** What a successful run should hand back to the agent. */
  outputs: z.string().min(1).max(300).optional(),
  category: z.string().min(1).max(80).optional(),
  version: z.string().min(1).max(80).default("unversioned"),
  validationStatus: validationStatusSchema.default("unvalidated"),
  provenance: skillProvenanceSchema.default({}),
})

export type SkillSummary = z.infer<typeof skillSummarySchema>

export const skillRecordSchema = skillSummarySchema.extend({
  content: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().nonnegative(),
})

export type SkillRecord = z.infer<typeof skillRecordSchema>

export const sourceImportStatusSchema = z.enum([
  "pending_audit",
  "needs_review",
  "metadata_only",
  "approved_for_import",
  "rejected",
  "imported",
])

export type SourceImportStatus = z.infer<typeof sourceImportStatusSchema>

export const sourceManifestEntrySchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  sourceUrl: z.string().url(),
  sourcePath: z.string().max(500).optional(),
  entryType: catalogEntryTypeSchema,
  license: z.string().max(200).default("unknown"),
  licenseNotes: z.string().max(2000).optional(),
  commitOrRelease: z.string().max(120).optional(),
  attributionRequired: z.boolean().default(true),
  importStatus: sourceImportStatusSchema,
  validationOutcome: z.string().max(2000).optional(),
  knownLimitations: z.array(z.string().max(500)).default([]),
  lastReviewedAt: z.string().datetime().optional(),
})

export type SourceManifestEntry = z.infer<typeof sourceManifestEntrySchema>

export const sourceManifestSchema = z.object({
  version: z.string().min(1),
  updatedAt: z.string().min(1),
  sources: z.array(sourceManifestEntrySchema).min(1),
})

export type SourceManifest = z.infer<typeof sourceManifestSchema>

export const parseSkillSummary = (input: unknown): SkillSummary => skillSummarySchema.parse(input)
export const parseSkillRecord = (input: unknown): SkillRecord => skillRecordSchema.parse(input)
export const parseSourceManifest = (input: unknown): SourceManifest => sourceManifestSchema.parse(input)
