import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { detectConflicts } from "../src/memory/conflicts.js"
import { MemoryService } from "../src/memory/service.js"
import { MemoryStore } from "../src/memory/store.js"
import type { MemoryLogEvent } from "../src/memory/logging.js"

const openTempStore = async (): Promise<{
  store: MemoryStore
  dbPath: string
  cleanup: () => Promise<void>
}> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "just-do-it-mem-"))
  const dbPath = path.join(dir, "memory.sqlite")
  const store = new MemoryStore({ dbPath })
  return {
    store,
    dbPath,
    cleanup: async () => {
      store.close()
      await fs.rm(dir, { recursive: true, force: true })
    },
  }
}

describe("MemoryStore + MemoryService", () => {
  const cleanups: Array<() => Promise<void>> = []

  afterEach(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop()
      if (fn) await fn()
    }
  })

  it("isolates records by ownerId and projectId before retrieval", async () => {
    const { store, cleanup } = await openTempStore()
    cleanups.push(cleanup)
    const memory = new MemoryService({ store })

    memory.save({
      ownerId: "alice",
      projectId: "proj-a",
      recordType: "decision",
      content: "Use PostgreSQL for billing ledger storage",
      verificationStatus: "verified",
    })
    memory.save({
      ownerId: "bob",
      projectId: "proj-a",
      recordType: "decision",
      content: "Use MongoDB for billing ledger storage",
      verificationStatus: "verified",
    })
    memory.save({
      ownerId: "alice",
      projectId: "proj-b",
      recordType: "decision",
      content: "Use SQLite for local cache only",
      verificationStatus: "verified",
    })

    const aliceA = memory.search({
      ownerId: "alice",
      projectId: "proj-a",
      query: "billing ledger",
    })
    expect(aliceA.records).toHaveLength(1)
    expect(aliceA.records[0]?.content).toContain("PostgreSQL")
    expect(aliceA.records.every((r) => r.ownerId === "alice" && r.projectId === "proj-a")).toBe(
      true,
    )

    const bobA = memory.getRelevant({
      ownerId: "bob",
      projectId: "proj-a",
      task: "billing ledger database choice",
    })
    expect(bobA.records.some((r) => r.content.includes("PostgreSQL"))).toBe(false)
    expect(bobA.records.some((r) => r.content.includes("MongoDB"))).toBe(true)

    const aliceB = memory.search({
      ownerId: "alice",
      projectId: "proj-b",
      query: "SQLite",
    })
    expect(aliceB.records).toHaveLength(1)
    expect(aliceB.records[0]?.projectId).toBe("proj-b")

    // Cross-tenant delete must not remove foreign records
    const foreignId = aliceA.records[0]!.id
    const denied = memory.delete({
      ownerId: "bob",
      projectId: "proj-a",
      recordId: foreignId,
    })
    expect(denied.deleted).toBe(false)
    expect(store.getById({ ownerId: "alice", projectId: "proj-a", id: foreignId })).toBeDefined()
  })

  it("does not return unrelated decisions when task has no relevance overlap", async () => {
    const { store, cleanup } = await openTempStore()
    cleanups.push(cleanup)
    const memory = new MemoryService({ store })

    memory.save({
      ownerId: "u1",
      projectId: "p1",
      recordType: "decision",
      content: "Prefer Redis for session cache storage",
      verificationStatus: "verified",
    })
    memory.save({
      ownerId: "u1",
      projectId: "p1",
      recordType: "decision",
      content: "Use Flyway for all database schema migrations",
      verificationStatus: "verified",
    })

    const cssTask = memory.getRelevant({
      ownerId: "u1",
      projectId: "p1",
      task: "How should we style CSS buttons and typography?",
    })
    expect(cssTask.records).toHaveLength(0)

    const dbTask = memory.getRelevant({
      ownerId: "u1",
      projectId: "p1",
      task: "database schema migrations with Flyway",
    })
    expect(dbTask.records.some((r) => r.content.includes("Flyway"))).toBe(true)
    expect(dbTask.records.some((r) => r.content.includes("Redis"))).toBe(false)
  })

  it("retrieves saved decisions after reopening the database (later session)", async () => {
    const { store, dbPath, cleanup } = await openTempStore()
    cleanups.push(cleanup)

    const session1 = new MemoryService({ store })
    const saved = session1.save({
      ownerId: "solo",
      projectId: "just-do-it",
      recordType: "decision",
      content: "Prefer SQLite for Phase 3 memory until multi-user hosting needs Postgres",
      verificationStatus: "verified",
      source: "agent_submitted",
    })
    store.close()

    const store2 = new MemoryStore({ dbPath })
    cleanups.push(async () => {
      store2.close()
    })
    const session2 = new MemoryService({ store: store2 })

    const found = session2.search({
      ownerId: "solo",
      projectId: "just-do-it",
      query: "SQLite Phase 3 memory",
    })
    expect(found.records.some((r) => r.id === saved.saved.id)).toBe(true)

    const relevant = session2.getRelevant({
      ownerId: "solo",
      projectId: "just-do-it",
      task: "What database did we choose for project memory?",
    })
    expect(relevant.records.some((r) => r.id === saved.saved.id)).toBe(true)
    expect(relevant.note).toMatch(/does not scrape/i)
  })

  it("supports inspect, export, and delete", async () => {
    const { store, cleanup } = await openTempStore()
    cleanups.push(cleanup)
    const memory = new MemoryService({ store })

    const a = memory.save({
      ownerId: "u1",
      projectId: "p1",
      recordType: "preference",
      content: "Prefer early returns in TypeScript",
    })
    const b = memory.save({
      ownerId: "u1",
      projectId: "p1",
      recordType: "constraint",
      content: "Do not execute skill scripts from MCP",
      verificationStatus: "verified",
    })

    const listed = memory.list({ ownerId: "u1", projectId: "p1" })
    expect(listed.totalReturned).toBe(2)
    expect(listed.records.map((r) => r.id).sort()).toEqual([a.saved.id, b.saved.id].sort())

    const exported = memory.export({ ownerId: "u1", projectId: "p1" })
    expect(exported.records).toHaveLength(2)
    expect(exported.exportedAt).toMatch(/^\d{4}-/)

    const del = memory.delete({ ownerId: "u1", projectId: "p1", recordId: a.saved.id })
    expect(del.deleted).toBe(true)
    expect(memory.search({ ownerId: "u1", projectId: "p1", query: "early returns" }).records).toHaveLength(
      0,
    )
    expect(
      memory.list({ ownerId: "u1", projectId: "p1" }).records.map((r) => r.id),
    ).toEqual([b.saved.id])
  })

  it("surfaces contradictory decisions and supports supersede correction", async () => {
    const { store, cleanup } = await openTempStore()
    cleanups.push(cleanup)
    const memory = new MemoryService({ store })

    const first = memory.save({
      ownerId: "u1",
      projectId: "p1",
      recordType: "decision",
      content: "Prefer Redis for session cache storage",
      verificationStatus: "verified",
    })
    const second = memory.save({
      ownerId: "u1",
      projectId: "p1",
      recordType: "decision",
      content: "Avoid Redis for session cache storage; prefer in-memory Map instead",
      verificationStatus: "unverified",
    })

    expect(second.conflicts.length).toBeGreaterThan(0)
    expect(
      second.conflicts.some(
        (c) =>
          (c.leftId === first.saved.id && c.rightId === second.saved.id) ||
          (c.rightId === first.saved.id && c.leftId === second.saved.id),
      ),
    ).toBe(true)

    const search = memory.search({
      ownerId: "u1",
      projectId: "p1",
      query: "Redis session cache",
    })
    expect(search.conflicts.length).toBeGreaterThan(0)

    const corrected = memory.save({
      ownerId: "u1",
      projectId: "p1",
      recordType: "decision",
      content: "Use in-memory Map for session cache; Redis deferred",
      verificationStatus: "verified",
      supersedesId: first.saved.id,
      source: "user_corrected",
    })
    expect(corrected.supersededId).toBe(first.saved.id)

    const active = memory.list({ ownerId: "u1", projectId: "p1" })
    expect(active.records.some((r) => r.id === first.saved.id)).toBe(false)
    expect(active.records.some((r) => r.id === corrected.saved.id)).toBe(true)

    const history = memory.list({
      ownerId: "u1",
      projectId: "p1",
      includeSuperseded: true,
    })
    const old = history.records.find((r) => r.id === first.saved.id)
    expect(old?.supersededBy).toBe(corrected.saved.id)
  })

  it("honors retention expiry and skips expired on search", async () => {
    const { store, cleanup } = await openTempStore()
    cleanups.push(cleanup)
    const memory = new MemoryService({ store })

    const past = new Date("2020-01-01T00:00:00.000Z")
    store.insert({
      ownerId: "u1",
      projectId: "p1",
      recordType: "reminder",
      content: "Temporary note about Flyway migrations",
      retentionDays: 1,
      now: past,
    })

    expect(
      memory.search({ ownerId: "u1", projectId: "p1", query: "Flyway" }).records,
    ).toHaveLength(0)

    const purged = memory.purgeExpired({ ownerId: "u1", projectId: "p1" })
    expect(purged).toBe(1)
  })

  it("never includes content bodies in memory log events", async () => {
    const events: MemoryLogEvent[] = []
    const { store, cleanup } = await openTempStore()
    cleanups.push(cleanup)
    const memory = new MemoryService({
      store,
      logger: (e) => events.push(e),
    })

    const secret = "SECRET_API_KEY=should-not-appear-in-logs"
    memory.save({
      ownerId: "u1",
      projectId: "p1",
      recordType: "constraint",
      content: secret,
    })
    memory.search({ ownerId: "u1", projectId: "p1", query: "SECRET" })

    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain("should-not-appear")
    expect(events.some((e) => e.op === "save")).toBe(true)
    expect(events.some((e) => e.op === "search")).toBe(true)
  })
})

describe("detectConflicts unit", () => {
  it("flags opposing polarity on shared topic tokens", () => {
    const conflicts = detectConflicts([
      {
        id: "11111111-1111-4111-8111-111111111111",
        ownerId: "o",
        projectId: "p",
        recordType: "decision",
        content: "Prefer GraphQL for public API surface",
        source: "t",
        verificationStatus: "verified",
        scope: "project",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        supersededBy: null,
        retentionExpiresAt: null,
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        ownerId: "o",
        projectId: "p",
        recordType: "decision",
        content: "Avoid GraphQL for public API surface; prefer REST instead",
        source: "t",
        verificationStatus: "unverified",
        scope: "project",
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        supersededBy: null,
        retentionExpiresAt: null,
      },
    ])
    expect(conflicts.length).toBe(1)
  })
})
