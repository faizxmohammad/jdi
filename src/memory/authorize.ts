import type { AuthPrincipal } from "../security/credentials.js"
import { ownerIdSchema, projectIdSchema, type MemoryAuthz } from "./types.js"

export class MemoryAuthzError extends Error {
  readonly code = "authz_denied" as const

  constructor(message = "Unauthorized memory access") {
    super(message)
    this.name = "MemoryAuthzError"
  }
}

/**
 * Ensure client-supplied ownerId matches the authenticated credential binding.
 * Closes Phase 3 residual: shared bearer holders asserting arbitrary ownerIds.
 */
export const bindOwnerId = (principal: AuthPrincipal, clientOwnerId: unknown): string => {
  const ownerParsed = ownerIdSchema.safeParse(clientOwnerId)
  if (!ownerParsed.success) {
    throw new MemoryAuthzError("Invalid ownerId or projectId")
  }
  if (ownerParsed.data !== principal.ownerId) {
    throw new MemoryAuthzError("ownerId does not match authenticated principal")
  }
  return ownerParsed.data
}

/**
 * Validate and normalize owner/project identity for memory operations.
 *
 * Trust model (Phase 5): HTTP auth binds a credential to ownerId. MCP tools must
 * call bindOwnerId before this helper (or pass the bound owner). The data layer
 * still filters by owner+project before ranking.
 */
export const requireMemoryAuthz = (input: {
  ownerId: unknown
  projectId: unknown
}): MemoryAuthz => {
  const ownerParsed = ownerIdSchema.safeParse(input.ownerId)
  const projectParsed = projectIdSchema.safeParse(input.projectId)

  if (!ownerParsed.success || !projectParsed.success) {
    throw new MemoryAuthzError("Invalid ownerId or projectId")
  }

  return {
    ownerId: ownerParsed.data,
    projectId: projectParsed.data,
  }
}

/** Bind principal owner + validate project for a memory tool call. */
export const requireBoundMemoryAuthz = (input: {
  principal: AuthPrincipal
  ownerId: unknown
  projectId: unknown
}): MemoryAuthz => {
  const ownerId = bindOwnerId(input.principal, input.ownerId)
  return requireMemoryAuthz({ ownerId, projectId: input.projectId })
}

/**
 * Ensure a loaded record belongs to the authorized scope.
 * Fail closed — never return foreign records.
 */
export const assertRecordInScope = (
  authz: MemoryAuthz,
  record: { ownerId: string; projectId: string } | undefined,
): void => {
  if (!record) {
    throw new MemoryAuthzError("Record not found in authorized scope")
  }
  if (record.ownerId !== authz.ownerId || record.projectId !== authz.projectId) {
    throw new MemoryAuthzError("Record not found in authorized scope")
  }
}
