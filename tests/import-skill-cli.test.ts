import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { diagnoseCatalog, runImportSkill } from "../src/catalog/importCommand.js"
import type { SourceManifest } from "../src/catalog/schema.js"

describe("import-skill command", () => {
  let root: string
  let manifestPath: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "just-do-it-import-"))
    manifestPath = path.join(root, "sources.manifest.json")
    const manifest: SourceManifest = {
      version: "0.1.0",
      updatedAt: "2026-10-19",
      sources: [
        {
          id: "just-do-it-local",
          title: "Local",
          sourceUrl: "https://example.invalid/just-do-it",
          entryType: "instruction_skill",
          license: "MIT",
          attributionRequired: false,
          importStatus: "imported",
          knownLimitations: [],
        },
        {
          id: "blocked-source",
          title: "Blocked",
          sourceUrl: "https://example.invalid/blocked",
          entryType: "instruction_skill",
          license: "unknown",
          attributionRequired: true,
          importStatus: "rejected",
          knownLimitations: [],
        },
      ],
    }
    await fs.writeFile(manifestPath, JSON.stringify(manifest), "utf8")
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it("blocks rejected sources", async () => {
    const from = path.join(root, "candidate")
    await fs.mkdir(from)
    await fs.writeFile(
      path.join(from, "SKILL.md"),
      "---\nname: candidate\ndescription: c\nsourceId: blocked-source\n---\n\nbody\n",
      "utf8",
    )

    const result = await runImportSkill({
      sourceId: "blocked-source",
      from,
      catalog: root,
      check: true,
      manifestPath,
    })

    expect(result.ok).toBe(false)
    expect(result.action).toBe("blocked")
    expect(result.reasons?.some((r) => r.includes("rejected") || r.includes("not importable"))).toBe(
      true,
    )
  })

  it("checks and imports a local original skill", async () => {
    const from = path.join(root, "fresh-local")
    await fs.mkdir(from)
    await fs.writeFile(
      path.join(from, "SKILL.md"),
      "---\nname: fresh-local\ndescription: Original\nsourceId: just-do-it-local\nversion: 0.1.0\n---\n\n# Fresh\n",
      "utf8",
    )

    const check = await runImportSkill({
      sourceId: "just-do-it-local",
      from,
      catalog: root,
      check: true,
      manifestPath,
    })
    expect(check.ok).toBe(true)

    const applied = await runImportSkill({
      sourceId: "just-do-it-local",
      from,
      catalog: root,
      check: false,
      manifestPath,
    })
    expect(applied.ok).toBe(true)
    expect(applied.action).toBe("import")
  })

  it("diagnoses a catalog", async () => {
    const skillDir = path.join(root, "ok-skill")
    await fs.mkdir(skillDir)
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: ok-skill\ndescription: ok\nsourceId: just-do-it-local\n---\n\n# Ok\n",
      "utf8",
    )
    const report = await diagnoseCatalog({ catalog: root, manifestPath })
    expect(report.ok).toBe(true)
  })
})
