import { z } from "zod"
import { TOKEN_SCOPES } from "./scopes.js"

export const ORG_ROLES = ["owner", "admin", "member", "viewer"] as const
export type OrgRole = (typeof ORG_ROLES)[number]

export const orgIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/,
    "orgId must be alphanumeric with ._-:",
  )

export const orgRoleSchema = z.enum(ORG_ROLES)

export const tokenScopeSchema = z.enum(TOKEN_SCOPES)

export const orgMemberSchema = z.object({
  ownerId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:@/-]*$/),
  role: orgRoleSchema,
})

/**
 * Team / org record — file-backed foundation for private catalogs and governance hooks.
 * Not a full SaaS tenancy model.
 */
export const orgRecordSchema = z.object({
  id: orgIdSchema,
  name: z.string().min(1).max(200),
  /** Absolute or process-cwd-relative path to a private team skills catalog. */
  catalogPath: z.string().min(1).max(1024).optional(),
  members: z.array(orgMemberSchema).min(1),
  /**
   * Named release channels the team may pin (governance hook).
   * Enforcement of channel gates is optional; schema exists for pilot policy experiments.
   */
  approvedChannels: z.array(z.string().min(1).max(64)).max(32).optional(),
  /** When true, operators should only distribute versions marked approved (policy hint). */
  requireApprovedVersions: z.boolean().optional(),
  /** Free-text integration / policy requirements for the team (guidance only). */
  policyNotes: z.string().max(4000).optional(),
})

export const orgsFileSchema = z.object({
  orgs: z.array(orgRecordSchema).default([]),
})

export type OrgMember = z.infer<typeof orgMemberSchema>
export type OrgRecord = z.infer<typeof orgRecordSchema>
export type OrgsFile = z.infer<typeof orgsFileSchema>
