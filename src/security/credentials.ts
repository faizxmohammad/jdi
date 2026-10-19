import { timingSafeEqual } from "node:crypto"
import { readFileSync } from "node:fs"
import { z } from "zod"
import { ownerIdSchema } from "../memory/types.js"
import type { OrgStore } from "../org/store.js"
import {
  ALL_SCOPES,
  clampScopesToRole,
  scopesForRole,
  scopesWithinRole,
  type OrgRole,
  type TokenScope,
} from "../org/scopes.js"
import { orgIdSchema, tokenScopeSchema } from "../org/types.js"

export type AuthPrincipal = {
  credentialId: string
  ownerId: string
  /** Optional team org binding (Phase 7). */
  orgId?: string
  /** Effective scopes; ALL_SCOPES when credential omits scopes. */
  scopes: readonly TokenScope[]
  /** Org role when orgId is set and membership resolves. */
  orgRole?: string
}

export type CredentialRecord = {
  id: string
  token: string
  ownerId: string
  revoked: boolean
  orgId?: string
  scopes?: readonly TokenScope[]
}

export type AuthResult =
  | { ok: true; principal: AuthPrincipal }
  | { ok: false; reason: "invalid" | "revoked" }

const TOKEN_SCOPE_MAX = 16

const fileSchema = z.object({
  credentials: z
    .array(
      z.object({
        id: z
          .string()
          .min(1)
          .max(128)
          .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/),
        token: z.string().min(32),
        ownerId: ownerIdSchema,
        revoked: z.boolean().default(false),
        orgId: orgIdSchema.optional(),
        scopes: z.array(tokenScopeSchema).min(1).max(TOKEN_SCOPE_MAX).optional(),
      }),
    )
    .default([]),
})

const constantTimeEquals = (actual: string, expected: string): boolean => {
  const a = Buffer.from(actual, "utf8")
  const b = Buffer.from(expected, "utf8")
  return a.length === b.length && timingSafeEqual(a, b)
}

const toPrincipal = (
  record: CredentialRecord,
  orgStore?: OrgStore,
): AuthPrincipal => {
  const principal: AuthPrincipal = {
    credentialId: record.id,
    ownerId: record.ownerId,
    scopes: [...ALL_SCOPES],
  }

  if (!record.orgId) {
    principal.scopes = record.scopes ? [...record.scopes] : [...ALL_SCOPES]
    return principal
  }

  principal.orgId = record.orgId
  const membership = orgStore?.resolveMembership(record.orgId, record.ownerId)
  if (!membership) {
    // createCredentialStore already fails closed; defensive default = empty.
    principal.scopes = []
    return principal
  }

  const role = membership.role as OrgRole
  principal.orgRole = role
  const roleMax = scopesForRole(role)
  // Org-bound credentials default to the role ceiling (not full admin).
  const requested = record.scopes ? [...record.scopes] : [...roleMax]
  principal.scopes = clampScopesToRole(requested, role)
  return principal
}

/**
 * Authenticate bearer tokens against an in-memory credential table.
 * Each active credential is bound to exactly one ownerId (closes client-asserted spoofing).
 * Optional orgId must resolve to a membership when an OrgStore is provided.
 */
export const createCredentialStore = (
  records: CredentialRecord[],
  options: { orgStore?: OrgStore } = {},
) => {
  if (records.length === 0) {
    throw new Error("Credential store requires at least one credential")
  }

  const orgStore = options.orgStore
  const seenTokens = new Set<string>()
  const seenIds = new Set<string>()
  for (const record of records) {
    if (seenIds.has(record.id)) {
      throw new Error(`Duplicate credential id: ${record.id}`)
    }
    if (seenTokens.has(record.token)) {
      throw new Error(`Duplicate credential token for id: ${record.id}`)
    }
    seenIds.add(record.id)
    seenTokens.add(record.token)

    if (record.orgId) {
      if (!orgStore) {
        throw new Error(
          `Credential ${record.id} has orgId=${record.orgId} but no orgs file is configured (JUST_DO_IT_ORGS_PATH)`,
        )
      }
      const org = orgStore.getOrg(record.orgId)
      if (!org) {
        throw new Error(`Credential ${record.id} references unknown orgId: ${record.orgId}`)
      }
      const membership = orgStore.resolveMembership(record.orgId, record.ownerId)
      if (!membership) {
        throw new Error(
          `Credential ${record.id}: ownerId ${record.ownerId} is not a member of org ${record.orgId}`,
        )
      }
      const role = membership.role as OrgRole
      if (record.scopes && !scopesWithinRole(record.scopes, role)) {
        throw new Error(
          `Credential ${record.id}: scopes exceed org role "${role}" maximum (${scopesForRole(role).join(", ")})`,
        )
      }
    }
  }

  const authenticate = (token: string): AuthResult => {
    let matched: CredentialRecord | undefined
    let matchedEqual = false

    // Always scan all records to reduce timing variance across token values.
    for (const record of records) {
      const equal = constantTimeEquals(token, record.token)
      if (equal) {
        matchedEqual = true
        matched = record
      }
    }

    if (!matchedEqual || !matched) {
      return { ok: false, reason: "invalid" }
    }
    if (matched.revoked) {
      return { ok: false, reason: "revoked" }
    }
    return {
      ok: true,
      principal: toPrincipal(matched, orgStore),
    }
  }

  return { authenticate, records: [...records] }
}

export type CredentialStore = ReturnType<typeof createCredentialStore>

export const loadCredentialsFromFile = (filePath: string): CredentialRecord[] => {
  const raw = readFileSync(filePath, "utf8")
  const parsed = fileSchema.safeParse(JSON.parse(raw) as unknown)
  if (!parsed.success) {
    throw new Error(`Invalid API tokens file: ${parsed.error.message}`)
  }
  return parsed.data.credentials.map((row) => {
    const record: CredentialRecord = {
      id: row.id,
      token: row.token,
      ownerId: row.ownerId,
      revoked: row.revoked,
    }
    if (row.orgId) record.orgId = row.orgId
    if (row.scopes) record.scopes = row.scopes
    return record
  })
}

export const buildCredentialStore = (options: {
  primaryToken: string
  primaryOwnerId: string
  tokensFilePath?: string
  orgStore?: OrgStore
}): CredentialStore => {
  const records: CredentialRecord[] = [
    {
      id: "primary",
      token: options.primaryToken,
      ownerId: options.primaryOwnerId,
      revoked: false,
    },
  ]

  if (options.tokensFilePath) {
    records.push(...loadCredentialsFromFile(options.tokensFilePath))
  }

  return createCredentialStore(records, {
    ...(options.orgStore ? { orgStore: options.orgStore } : {}),
  })
}
