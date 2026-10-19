import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { runCatalogDiagnostics } from "../src/catalog/diagnostics.js"
import { parseSourceManifest } from "../src/catalog/schema.js"

describe("catalog diagnostics", () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "just-do-it-diag-"))
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  const manifest = parseSourceManifest({
    version: "0.1.0",
    updatedAt: "2026-10-19",
    sources: [
      {
        id: "just-do-it-local",
        title: "Local",
        sourceUrl: "https://example.invalid/just-do-it",
        entryType: "instruction_skill",
        license: "MIT",
        importStatus: "imported",
      },
      {
        id: "blocked-source",
        title: "Blocked",
        sourceUrl: "https://example.com/blocked",
        entryType: "instruction_skill",
        license: "unknown",
        importStatus: "pending_audit",
      },
    ],
  })

  const writeSkill = async (name: string, body: string): Promise<void> => {
    const dir = path.join(root, name)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, "SKILL.md"), body, "utf8")
  }

  it("reports ok for a clean local skill", async () => {
    await writeSkill(
      "alpha",
      "---\nname: alpha\ndescription: A skill\nsourceId: just-do-it-local\nversion: 1.0.0\n---\n\nbody\n",
    )
    const report = await runCatalogDiagnostics({ catalogPath: root, manifest })
    expect(report.ok).toBe(true)
    expect(report.skillCount).toBe(1)
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([])
  })

  it("detects duplicate names and digests", async () => {
    const body =
      "---\nname: twin\ndescription: Same\nsourceId: just-do-it-local\n---\n\nidentical\n"
    await writeSkill("one", body)
    await writeSkill("two", body)

    const report = await runCatalogDiagnostics({ catalogPath: root, manifest })
    expect(report.ok).toBe(false)
    expect(report.duplicates.byName.length).toBeGreaterThanOrEqual(1)
    expect(report.duplicates.byDigest.length).toBeGreaterThanOrEqual(1)
    expect(report.findings.some((f) => f.code === "duplicate_name")).toBe(true)
    expect(report.findings.some((f) => f.code === "duplicate_digest")).toBe(true)
  })

  it("flags skills from unauthorized sources", async () => {
    await writeSkill(
      "evil",
      "---\nname: evil\ndescription: Nope\nsourceId: blocked-source\n---\n\nx\n",
    )
    const report = await runCatalogDiagnostics({ catalogPath: root, manifest })
    expect(report.ok).toBe(false)
    expect(report.findings.some((f) => f.code === "unauthorized_source")).toBe(true)
  })

  it("flags malformed metadata", async () => {
    await writeSkill("broken", "---\nname: broken\n---\n\nno description\n")
    const report = await runCatalogDiagnostics({ catalogPath: root, manifest })
    expect(report.ok).toBe(false)
    expect(report.findings.some((f) => f.code === "missing_description")).toBe(true)
  })

  it("flags missing sourceId (no silent local default)", async () => {
    await writeSkill("no-src", "---\nname: no-src\ndescription: has desc\n---\n\nbody\n")
    const report = await runCatalogDiagnostics({ catalogPath: root, manifest })
    expect(report.ok).toBe(false)
    expect(report.findings.some((f) => f.code === "missing_sourceId")).toBe(true)
  })
})
