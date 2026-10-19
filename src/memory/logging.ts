/**
 * Privacy-conscious memory logging: never log record content bodies.
 * Operators may log ids, owner/project, and operation names only.
 */
export type MemoryLogEvent = {
  op:
    | "save"
    | "get"
    | "search"
    | "list"
    | "delete"
    | "export"
    | "purge_expired"
    | "authz_denied"
  ownerId: string
  projectId: string
  recordId?: string
  count?: number
}

export type MemoryLogger = (event: MemoryLogEvent) => void

export const defaultMemoryLogger: MemoryLogger = (event) => {
  // Structured, content-free. Avoids dumping private project text into stdout.
  console.info("memory", {
    op: event.op,
    ownerId: event.ownerId,
    projectId: event.projectId,
    ...(event.recordId ? { recordId: event.recordId } : {}),
    ...(event.count !== undefined ? { count: event.count } : {}),
  })
}

export const silentMemoryLogger: MemoryLogger = () => {
  // no-op for tests
}
