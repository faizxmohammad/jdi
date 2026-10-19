import { randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import {
  memoryRecordSchema,
  type MemoryRecord,
  type MemoryRecordType,
  type MemoryScope,
  type SaveMemoryInput,
  type VerificationStatus,
} from "./types.js"

export interface MemoryStoreOptions {
  /** File path, or `:memory:` for ephemeral tests. */
  dbPath: string
}

type Row = {
  id: string
  owner_id: string
  project_id: string
  record_type: string
  content: string
  source: string
  verification_status: string
  scope: string
  created_at: string
  updated_at: string
  superseded_by: string | null
  retention_expires_at: string | null
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS memory_records (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  scope TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  superseded_by TEXT,
  retention_expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_memory_owner_project
  ON memory_records (owner_id, project_id);

CREATE INDEX IF NOT EXISTS idx_memory_type
  ON memory_records (owner_id, project_id, record_type);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  content,
  record_type,
  source,
  content='memory_records',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS memory_ai AFTER INSERT ON memory_records BEGIN
  INSERT INTO memory_fts(rowid, content, record_type, source)
  VALUES (new.rowid, new.content, new.record_type, new.source);
END;

CREATE TRIGGER IF NOT EXISTS memory_ad AFTER DELETE ON memory_records BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, content, record_type, source)
  VALUES ('delete', old.rowid, old.content, old.record_type, old.source);
END;

CREATE TRIGGER IF NOT EXISTS memory_au AFTER UPDATE ON memory_records BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, content, record_type, source)
  VALUES ('delete', old.rowid, old.content, old.record_type, old.source);
  INSERT INTO memory_fts(rowid, content, record_type, source)
  VALUES (new.rowid, new.content, new.record_type, new.source);
END;
`

const rowToRecord = (row: Row): MemoryRecord =>
  memoryRecordSchema.parse({
    id: row.id,
    ownerId: row.owner_id,
    projectId: row.project_id,
    recordType: row.record_type,
    content: row.content,
    source: row.source,
    verificationStatus: row.verification_status,
    scope: row.scope,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    supersededBy: row.superseded_by,
    retentionExpiresAt: row.retention_expires_at,
  })

export class MemoryStore {
  private readonly db: DatabaseSync
  private closed = false

  constructor(options: MemoryStoreOptions) {
    if (options.dbPath !== ":memory:") {
      mkdirSync(path.dirname(path.resolve(options.dbPath)), { recursive: true })
    }
    this.db = new DatabaseSync(options.dbPath)
    this.db.exec("PRAGMA foreign_keys = ON;")
    this.db.exec(SCHEMA)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.db.close()
  }

  insert(input: SaveMemoryInput & { id?: string; now?: Date }): MemoryRecord {
    const now = (input.now ?? new Date()).toISOString()
    const id = input.id ?? randomUUID()
    const retentionExpiresAt =
      input.retentionDays !== undefined && input.retentionDays > 0
        ? new Date(
            (input.now ?? new Date()).getTime() + input.retentionDays * 86_400_000,
          ).toISOString()
        : null

    const record: MemoryRecord = memoryRecordSchema.parse({
      id,
      ownerId: input.ownerId,
      projectId: input.projectId,
      recordType: input.recordType,
      content: input.content,
      source: input.source ?? "agent_submitted",
      verificationStatus: input.verificationStatus ?? "unverified",
      scope: input.scope ?? "project",
      createdAt: now,
      updatedAt: now,
      supersededBy: null,
      retentionExpiresAt,
    })

    this.db
      .prepare(
        `INSERT INTO memory_records (
          id, owner_id, project_id, record_type, content, source,
          verification_status, scope, created_at, updated_at,
          superseded_by, retention_expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.ownerId,
        record.projectId,
        record.recordType,
        record.content,
        record.source,
        record.verificationStatus,
        record.scope,
        record.createdAt,
        record.updatedAt,
        record.supersededBy,
        record.retentionExpiresAt,
      )

    return record
  }

  markSuperseded(params: {
    ownerId: string
    projectId: string
    targetId: string
    successorId: string
    now?: Date
  }): boolean {
    const updatedAt = (params.now ?? new Date()).toISOString()
    const result = this.db
      .prepare(
        `UPDATE memory_records
         SET superseded_by = ?, updated_at = ?
         WHERE id = ? AND owner_id = ? AND project_id = ? AND superseded_by IS NULL`,
      )
      .run(
        params.successorId,
        updatedAt,
        params.targetId,
        params.ownerId,
        params.projectId,
      )
    return Number(result.changes) > 0
  }

  getById(params: {
    ownerId: string
    projectId: string
    id: string
  }): MemoryRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM memory_records
         WHERE id = ? AND owner_id = ? AND project_id = ?`,
      )
      .get(params.id, params.ownerId, params.projectId) as Row | undefined
    return row ? rowToRecord(row) : undefined
  }

  /**
   * List records for an authorized owner+project.
   * Authorization must already be enforced by callers via ownerId/projectId.
   */
  list(params: {
    ownerId: string
    projectId: string
    includeSuperseded?: boolean
    includeExpired?: boolean
    recordTypes?: MemoryRecordType[]
    limit?: number
    offset?: number
    now?: Date
  }): MemoryRecord[] {
    const nowIso = (params.now ?? new Date()).toISOString()
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200)
    const offset = Math.max(params.offset ?? 0, 0)

    const clauses = ["owner_id = ?", "project_id = ?"]
    const args: Array<string | number> = [params.ownerId, params.projectId]

    if (!params.includeSuperseded) {
      clauses.push("superseded_by IS NULL")
    }
    if (!params.includeExpired) {
      clauses.push("(retention_expires_at IS NULL OR retention_expires_at > ?)")
      args.push(nowIso)
    }
    if (params.recordTypes && params.recordTypes.length > 0) {
      clauses.push(
        `record_type IN (${params.recordTypes.map(() => "?").join(", ")})`,
      )
      args.push(...params.recordTypes)
    }

    args.push(limit, offset)

    const rows = this.db
      .prepare(
        `SELECT * FROM memory_records
         WHERE ${clauses.join(" AND ")}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...args) as Row[]

    return rows.map(rowToRecord)
  }

  /**
   * Full-text search within an authorized owner+project scope only.
   * Returns rows with bm25-ish rank (lower fts rank = better; we invert to score).
   */
  searchFts(params: {
    ownerId: string
    projectId: string
    query: string
    includeSuperseded?: boolean
    includeExpired?: boolean
    limit?: number
    now?: Date
  }): Array<MemoryRecord & { ftsRank: number }> {
    const trimmed = params.query.trim()
    if (!trimmed) return []

    const nowIso = (params.now ?? new Date()).toISOString()
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100)
    const ftsQuery = toFtsQuery(trimmed)
    if (!ftsQuery) return []

    const clauses = [
      "m.owner_id = ?",
      "m.project_id = ?",
      "memory_fts MATCH ?",
    ]
    const args: Array<string | number> = [
      params.ownerId,
      params.projectId,
      ftsQuery,
    ]

    if (!params.includeSuperseded) {
      clauses.push("m.superseded_by IS NULL")
    }
    if (!params.includeExpired) {
      clauses.push("(m.retention_expires_at IS NULL OR m.retention_expires_at > ?)")
      args.push(nowIso)
    }

    args.push(limit)

    const rows = this.db
      .prepare(
        `SELECT m.*, bm25(memory_fts) AS fts_rank
         FROM memory_fts
         JOIN memory_records m ON m.rowid = memory_fts.rowid
         WHERE ${clauses.join(" AND ")}
         ORDER BY fts_rank ASC, m.created_at DESC
         LIMIT ?`,
      )
      .all(...args) as Array<Row & { fts_rank: number }>

    return rows.map((row) => ({
      ...rowToRecord(row),
      ftsRank: Number(row.fts_rank),
    }))
  }

  delete(params: {
    ownerId: string
    projectId: string
    id: string
  }): boolean {
    const result = this.db
      .prepare(
        `DELETE FROM memory_records
         WHERE id = ? AND owner_id = ? AND project_id = ?`,
      )
      .run(params.id, params.ownerId, params.projectId)
    return Number(result.changes) > 0
  }

  purgeExpired(params: {
    ownerId?: string
    projectId?: string
    now?: Date
  } = {}): number {
    const nowIso = (params.now ?? new Date()).toISOString()
    const clauses = ["retention_expires_at IS NOT NULL", "retention_expires_at <= ?"]
    const args: string[] = [nowIso]

    if (params.ownerId) {
      clauses.push("owner_id = ?")
      args.push(params.ownerId)
    }
    if (params.projectId) {
      clauses.push("project_id = ?")
      args.push(params.projectId)
    }

    const result = this.db
      .prepare(`DELETE FROM memory_records WHERE ${clauses.join(" AND ")}`)
      .run(...args)
    return Number(result.changes)
  }

  /** Cross-tenant probe helper for isolation tests — must return undefined when wrong owner. */
  unsafeGetByIdOnly(id: string): MemoryRecord | undefined {
    const row = this.db
      .prepare(`SELECT * FROM memory_records WHERE id = ?`)
      .get(id) as Row | undefined
    return row ? rowToRecord(row) : undefined
  }
}

/** Build a safe FTS5 MATCH query from free text (AND of token prefixes). */
export const toFtsQuery = (raw: string): string | undefined => {
  const tokens = raw
    .toLowerCase()
    .split(/[^a-z0-9_./+-]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 12)

  if (tokens.length === 0) return undefined

  return tokens
    .map((t) => {
      const safe = t.replace(/"/g, "")
      return `"${safe}"*`
    })
    .join(" ")
}

export type { MemoryRecordType, MemoryScope, VerificationStatus }
