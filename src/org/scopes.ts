/**
 * Token scopes for team / multi-owner foundation (Phase 7).
 * Omitting scopes on a credential grants ALL_SCOPES (solo/private backward compatible).
 */

export const TOKEN_SCOPES = [
  "catalog:read",
  "catalog:write",
  "memory:read",
  "memory:write",
  "admin",
] as const

export type TokenScope = (typeof TOKEN_SCOPES)[number]

export const ALL_SCOPES: readonly TokenScope[] = [...TOKEN_SCOPES]

export const CATALOG_READ_SCOPES: readonly TokenScope[] = ["catalog:read", "catalog:write", "admin"]
export const CATALOG_WRITE_SCOPES: readonly TokenScope[] = ["catalog:write", "admin"]
export const MEMORY_READ_SCOPES: readonly TokenScope[] = ["memory:read", "memory:write", "admin"]
export const MEMORY_WRITE_SCOPES: readonly TokenScope[] = ["memory:write", "admin"]
export const ADMIN_SCOPES: readonly TokenScope[] = ["admin"]

export class ScopeDeniedError extends Error {
  readonly scope: TokenScope
  constructor(scope: TokenScope) {
    super(`Missing required scope: ${scope}`)
    this.name = "ScopeDeniedError"
    this.scope = scope
  }
}

export const hasScope = (
  granted: readonly TokenScope[],
  required: TokenScope,
): boolean => {
  if (granted.includes("admin")) return true
  if (required === "catalog:read" && granted.includes("catalog:write")) return true
  if (required === "memory:read" && granted.includes("memory:write")) return true
  return granted.includes(required)
}

export const requireScope = (
  granted: readonly TokenScope[],
  required: TokenScope,
): void => {
  if (!hasScope(granted, required)) {
    throw new ScopeDeniedError(required)
  }
}

export type OrgRole = "owner" | "admin" | "member" | "viewer"

/** Maximum scopes allowed for an org role (hard ceiling). */
export const scopesForRole = (role: OrgRole): readonly TokenScope[] => {
  switch (role) {
    case "owner":
    case "admin":
      return ALL_SCOPES
    case "member":
      return ["catalog:read", "memory:read", "memory:write"]
    case "viewer":
      return ["catalog:read", "memory:read"]
  }
}

/** Intersection of requested scopes with the role ceiling (preserves request order). */
export const clampScopesToRole = (
  requested: readonly TokenScope[],
  role: OrgRole,
): TokenScope[] => {
  const allowed = new Set<TokenScope>(scopesForRole(role))
  return requested.filter((scope) => allowed.has(scope))
}

/** True when every requested scope is within the role ceiling. */
export const scopesWithinRole = (
  requested: readonly TokenScope[],
  role: OrgRole,
): boolean => {
  const allowed = new Set<TokenScope>(scopesForRole(role))
  return requested.every((scope) => allowed.has(scope))
}
