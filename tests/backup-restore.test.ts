import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { MemoryService } from "../src/memory/service.js"
import { MemoryStore } from "../src/memory/store.js"

describe("memory backup restore smoke", () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "just-do-it-backup-"))
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it("restores records from a copied sqlite file", async () => {
    const livePath = path.join(dir, "live.sqlite")
    const backupPath = path.join(dir, "backup.sqlite")

    const liveStore = new MemoryStore({ dbPath: livePath })
    const live = new MemoryService({ store: liveStore })
    const saved = live.save({
      ownerId: "owner-a",
      projectId: "proj-1",
      recordType: "decision",
      content: "Backup restore must retain this decision",
      verificationStatus: "verified",
    })

    // Operator procedure: stop writers, copy file, reopen from copy.
    await fs.copyFile(livePath, backupPath)

    const restoredStore = new MemoryStore({ dbPath: backupPath })
    const restored = new MemoryService({ store: restoredStore })
    const listed = restored.list({ ownerId: "owner-a", projectId: "proj-1" })
    expect(listed.records.some((r) => r.id === saved.saved.id)).toBe(true)
    expect(listed.records.some((r) => r.content.includes("Backup restore"))).toBe(true)
  })
})
