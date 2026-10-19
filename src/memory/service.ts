import {
  assertRecordInScope,
  MemoryAuthzError,
  requireMemoryAuthz,
} from "./authorize.js"
import { conflictsForHits, detectConflicts, tokenizeContent } from "./conflicts.js"
import {
  silentMemoryLogger,
  type MemoryLogEvent,
  type MemoryLogger,
} from "./logging.js"
import { MemoryStore } from "./store.js"
import {
  memoryRecordTypeSchema,
  type MemoryConflict,
  type MemoryHit,
  type MemoryRecord,
  type SaveMemoryInput,
  type VerificationStatus,
} from "./types.js"

export interface MemoryServiceOptions {
  store: MemoryStore
  logger?: MemoryLogger
  defaultRetentionDays?: number
}

export interface GetProjectContextResult {
  ownerId: string
  projectId: string
  task: string
  records: MemoryHit[]
  conflicts: MemoryConflict[]
  note: string
}

export interface SearchProjectMemoryResult {
  ownerId: string
  projectId: string
  query: string
  records: MemoryHit[]
  conflicts: MemoryConflict[]
}

export interface SaveProjectContextResult {
  saved: MemoryRecord
  supersededId: string | null
  conflicts: MemoryConflict[]
}

export interface ListProjectMemoryResult {
  ownerId: string
  projectId: string
  records: MemoryRecord[]
  conflicts: MemoryConflict[]
  totalReturned: number
}

export interface ExportProjectMemoryResult {
  ownerId: string
  projectId: string
  exportedAt: string
  records: MemoryRecord[]
}

const VERIFICATION_BOOST: Record<VerificationStatus, number> = {
  verified: 4,
  unverified: 1,
  assumption: 0,
  summary: 1,
}

const TYPE_BOOST: Partial<Record<MemoryRecord["recordType"], number>> = {
  decision: 5,
  constraint: 4,
  preference: 3,
  rejected_approach: 2,
  open_question: 1,
  outcome: 2,
  task_summary: 1,
  reminder: 2,
}

export class MemoryService {
  private readonly store: MemoryStore
  private readonly logger: MemoryLogger
  private readonly defaultRetentionDays: number

  constructor(options: MemoryServiceOptions) {
    this.store = options.store
    this.logger = options.logger ?? silentMemoryLogger
    this.defaultRetentionDays = options.defaultRetentionDays ?? 0
  }

  private log(event: MemoryLogEvent): void {
    this.logger(event)
  }

  save(input: SaveMemoryInput): SaveProjectContextResult {
    const authz = requireMemoryAuthz(input)
    memoryRecordTypeSchema.parse(input.recordType)

    if (input.supersedesId) {
      const prior = this.store.getById({
        ownerId: authz.ownerId,
        projectId: authz.projectId,
        id: input.supersedesId,
      })
      assertRecordInScope(authz, prior)
    }

    const insertInput: SaveMemoryInput & { id?: string; now?: Date } = {
      ownerId: authz.ownerId,
      projectId: authz.projectId,
      recordType: input.recordType,
      content: input.content,
      source: input.source ?? "agent_submitted",
    }
    if (input.verificationStatus !== undefined) {
      insertInput.verificationStatus = input.verificationStatus
    }
    if (input.scope !== undefined) {
      insertInput.scope = input.scope
    }
    if (input.supersedesId !== undefined) {
      insertInput.supersedesId = input.supersedesId
    }
    const retentionDays =
      input.retentionDays ??
      (this.defaultRetentionDays > 0 ? this.defaultRetentionDays : undefined)
    if (retentionDays !== undefined) {
      insertInput.retentionDays = retentionDays
    }

    const saved = this.store.insert(insertInput)

    let supersededId: string | null = null
    if (input.supersedesId) {
      const ok = this.store.markSuperseded({
        ownerId: authz.ownerId,
        projectId: authz.projectId,
        targetId: input.supersedesId,
        successorId: saved.id,
      })
      if (!ok) {
        // Roll back orphan successor if supersede target vanished mid-flight.
        this.store.delete({
          ownerId: authz.ownerId,
          projectId: authz.projectId,
          id: saved.id,
        })
        throw new MemoryAuthzError("supersedesId not found in authorized scope")
      }
      supersededId = input.supersedesId
    }

    const active = this.store.list({
      ownerId: authz.ownerId,
      projectId: authz.projectId,
      limit: 200,
    })
    const conflicts = detectConflicts(active)

    this.log({
      op: "save",
      ownerId: authz.ownerId,
      projectId: authz.projectId,
      recordId: saved.id,
    })

    return { saved, supersededId, conflicts }
  }

  getRelevant(params: {
    ownerId: string
    projectId: string
    task: string
    limit?: number
  }): GetProjectContextResult {
    const authz = requireMemoryAuthz(params)
    const limit = Math.min(Math.max(params.limit ?? 10, 1), 50)
    const task = params.task.trim()

    const active = this.store.list({
      ownerId: authz.ownerId,
      projectId: authz.projectId,
      limit: 200,
    })

    const ftsHits =
      task.length > 0
        ? this.store.searchFts({
            ownerId: authz.ownerId,
            projectId: authz.projectId,
            query: task,
            limit: limit * 3,
          })
        : []

    const ftsById = new Map(ftsHits.map((h) => [h.id, h]))
    const taskTokens = new Set(tokenizeContent(task))

    type Scored = MemoryHit & { relevance: number }
    const scored: Scored[] = active.map((record) => {
      const fts = ftsById.get(record.id)
      let relevance = 0
      let matchKind: MemoryHit["matchKind"] = "recency"

      if (fts) {
        // bm25: lower is better; convert to positive score
        relevance += Math.max(0, 20 - fts.ftsRank)
        matchKind = "fts"
      }

      const contentTokens = tokenizeContent(record.content)
      let overlap = 0
      for (const t of contentTokens) {
        if (taskTokens.has(t)) overlap += 1
      }
      if (overlap > 0) {
        relevance += overlap * 3
        if (matchKind === "recency") matchKind = "task_overlap"
      }

      // Exact-ish identifier hits (paths, error codes)
      for (const t of taskTokens) {
        if (t.length >= 4 && record.content.toLowerCase().includes(t)) {
          relevance += 2
          matchKind = matchKind === "recency" ? "exact" : matchKind
        }
      }

      // Type/verification/recency boost ranking among relevant hits only — never alone.
      let score = relevance
      score += VERIFICATION_BOOST[record.verificationStatus] ?? 0
      score += TYPE_BOOST[record.recordType] ?? 0

      const ageMs = Date.now() - Date.parse(record.createdAt)
      if (Number.isFinite(ageMs) && ageMs < 30 * 86_400_000) {
        score += 1
      }

      return { ...record, score, matchKind, relevance }
    })

    scored.sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt))

    const toHit = ({ relevance: _relevance, ...hit }: Scored): MemoryHit => hit

    // Empty task: recent high-value types. Non-empty task: require task relevance
    // (FTS / token overlap / exact) so type boost alone cannot leak unrelated decisions.
    const finalRecords: MemoryHit[] =
      task.length === 0
        ? scored
            .filter(
              (r) =>
                r.recordType === "decision" ||
                r.recordType === "constraint" ||
                r.recordType === "preference",
            )
            .slice(0, limit)
            .map(toHit)
        : scored.filter((r) => r.relevance > 0).slice(0, limit).map(toHit)

    const conflicts = conflictsForHits(finalRecords, active)

    this.log({
      op: "get",
      ownerId: authz.ownerId,
      projectId: authz.projectId,
      count: finalRecords.length,
    })

    return {
      ownerId: authz.ownerId,
      projectId: authz.projectId,
      task,
      records: finalRecords,
      conflicts,
      note:
        "Only explicitly saved context is available. Just-do-it does not scrape conversations.",
    }
  }

  search(params: {
    ownerId: string
    projectId: string
    query: string
    limit?: number
  }): SearchProjectMemoryResult {
    const authz = requireMemoryAuthz(params)
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 50)
    const query = params.query.trim()

    const active = this.store.list({
      ownerId: authz.ownerId,
      projectId: authz.projectId,
      limit: 200,
    })

    const ftsHits = this.store.searchFts({
      ownerId: authz.ownerId,
      projectId: authz.projectId,
      query,
      limit,
    })

    const records: MemoryHit[] = ftsHits.map((h) => ({
      ...h,
      score: Math.max(0, 20 - h.ftsRank) + (VERIFICATION_BOOST[h.verificationStatus] ?? 0),
      matchKind: "fts" as const,
    }))

    // Fallback: substring over authorized active set when FTS yields nothing
    if (records.length === 0 && query.length >= 2) {
      const q = query.toLowerCase()
      for (const record of active) {
        if (!record.content.toLowerCase().includes(q)) continue
        records.push({
          ...record,
          score: 5 + (VERIFICATION_BOOST[record.verificationStatus] ?? 0),
          matchKind: "exact",
        })
        if (records.length >= limit) break
      }
    }

    records.sort((a, b) => b.score - a.score)
    const bounded = records.slice(0, limit)
    const conflicts = conflictsForHits(bounded, active)

    this.log({
      op: "search",
      ownerId: authz.ownerId,
      projectId: authz.projectId,
      count: bounded.length,
    })

    return {
      ownerId: authz.ownerId,
      projectId: authz.projectId,
      query,
      records: bounded,
      conflicts,
    }
  }

  list(params: {
    ownerId: string
    projectId: string
    includeSuperseded?: boolean
    limit?: number
    offset?: number
  }): ListProjectMemoryResult {
    const authz = requireMemoryAuthz(params)
    const listParams: Parameters<MemoryStore["list"]>[0] = {
      ownerId: authz.ownerId,
      projectId: authz.projectId,
      includeSuperseded: params.includeSuperseded ?? false,
    }
    if (params.limit !== undefined) listParams.limit = params.limit
    if (params.offset !== undefined) listParams.offset = params.offset
    const records = this.store.list(listParams)
    const conflicts = detectConflicts(records)

    this.log({
      op: "list",
      ownerId: authz.ownerId,
      projectId: authz.projectId,
      count: records.length,
    })

    return {
      ownerId: authz.ownerId,
      projectId: authz.projectId,
      records,
      conflicts,
      totalReturned: records.length,
    }
  }

  delete(params: {
    ownerId: string
    projectId: string
    recordId: string
  }): { deleted: boolean; recordId: string } {
    const authz = requireMemoryAuthz(params)
    const existing = this.store.getById({
      ownerId: authz.ownerId,
      projectId: authz.projectId,
      id: params.recordId,
    })
    if (!existing) {
      this.log({
        op: "authz_denied",
        ownerId: authz.ownerId,
        projectId: authz.projectId,
        recordId: params.recordId,
      })
      return { deleted: false, recordId: params.recordId }
    }

    const deleted = this.store.delete({
      ownerId: authz.ownerId,
      projectId: authz.projectId,
      id: params.recordId,
    })

    this.log({
      op: "delete",
      ownerId: authz.ownerId,
      projectId: authz.projectId,
      recordId: params.recordId,
    })

    return { deleted, recordId: params.recordId }
  }

  export(params: {
    ownerId: string
    projectId: string
    includeSuperseded?: boolean
  }): ExportProjectMemoryResult {
    const authz = requireMemoryAuthz(params)
    const records = this.store.list({
      ownerId: authz.ownerId,
      projectId: authz.projectId,
      includeSuperseded: params.includeSuperseded ?? true,
      limit: 200,
    })

    this.log({
      op: "export",
      ownerId: authz.ownerId,
      projectId: authz.projectId,
      count: records.length,
    })

    return {
      ownerId: authz.ownerId,
      projectId: authz.projectId,
      exportedAt: new Date().toISOString(),
      records,
    }
  }

  purgeExpired(params: { ownerId?: string; projectId?: string } = {}): number {
    const count = this.store.purgeExpired(params)
    this.log({
      op: "purge_expired",
      ownerId: params.ownerId ?? "*",
      projectId: params.projectId ?? "*",
      count,
    })
    return count
  }
}

export { MemoryAuthzError }
