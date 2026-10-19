import { z } from "zod"

export const MEMORY_RECORD_TYPES = [
  "preference",
  "constraint",
  "decision",
  "open_question",
  "task_summary",
  "outcome",
  "rejected_approach",
  "reminder",
] as const

export type MemoryRecordType = (typeof MEMORY_RECORD_TYPES)[number]

export const VERIFICATION_STATUSES = [
  "unverified",
  "verified",
  "assumption",
  "summary",
] as const

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number]

export const MEMORY_SCOPES = ["project", "user"] as const
export type MemoryScope = (typeof MEMORY_SCOPES)[number]

const idSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:@/-]*$/)

export const ownerIdSchema = idSchema.describe(
  "Logical owner id; must match the authenticated credential binding",
)
export const projectIdSchema = idSchema.describe("Project id within an owner")

export const memoryRecordTypeSchema = z.enum(MEMORY_RECORD_TYPES)
export const verificationStatusSchema = z.enum(VERIFICATION_STATUSES)
export const memoryScopeSchema = z.enum(MEMORY_SCOPES)

export const memoryRecordSchema = z.object({
  id: z.string().uuid(),
  ownerId: ownerIdSchema,
  projectId: projectIdSchema,
  recordType: memoryRecordTypeSchema,
  content: z.string().min(1).max(16_000),
  source: z.string().min(1).max(500),
  verificationStatus: verificationStatusSchema,
  scope: memoryScopeSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  supersededBy: z.string().uuid().nullable(),
  retentionExpiresAt: z.string().datetime().nullable(),
})

export type MemoryRecord = z.infer<typeof memoryRecordSchema>

export const memoryConflictSchema = z.object({
  leftId: z.string().uuid(),
  rightId: z.string().uuid(),
  reason: z.string().min(1).max(500),
})

export type MemoryConflict = z.infer<typeof memoryConflictSchema>

export const memoryHitSchema = memoryRecordSchema.extend({
  score: z.number(),
  matchKind: z.enum(["fts", "exact", "recency", "task_overlap"]),
})

export type MemoryHit = z.infer<typeof memoryHitSchema>

export interface SaveMemoryInput {
  ownerId: string
  projectId: string
  recordType: MemoryRecordType
  content: string
  source?: string
  verificationStatus?: VerificationStatus
  scope?: MemoryScope
  retentionDays?: number
  supersedesId?: string
}

export interface MemoryAuthz {
  ownerId: string
  projectId: string
}
