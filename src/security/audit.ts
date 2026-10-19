/**
 * Operational audit events. Never include tokens, Authorization headers, or memory content.
 */
export type AuditEvent = {
  event: "auth_ok" | "auth_fail" | "auth_revoked" | "owner_mismatch" | "scope_denied"
  credentialId?: string
  ownerId?: string
  clientOwnerId?: string
  orgId?: string
  scope?: string
  remote?: string
}

export type AuditLogger = (event: AuditEvent) => void

export const defaultAuditLogger: AuditLogger = (event) => {
  console.info("audit", {
    event: event.event,
    ...(event.credentialId ? { credentialId: event.credentialId } : {}),
    ...(event.ownerId ? { ownerId: event.ownerId } : {}),
    ...(event.clientOwnerId ? { clientOwnerId: event.clientOwnerId } : {}),
    ...(event.orgId ? { orgId: event.orgId } : {}),
    ...(event.scope ? { scope: event.scope } : {}),
    ...(event.remote ? { remote: event.remote } : {}),
  })
}

export const silentAuditLogger: AuditLogger = () => {
  // no-op for tests
}
