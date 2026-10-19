import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { parseSourceManifest } from "../src/catalog/schema.js"
import { SkillCatalog } from "../src/skills/catalog.js"

const localManifest = parseSourceManifest({
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
  ],
})

describe("SkillCatalog", () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "just-do-it-"))
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  const writeSkill = async (name: string, body: string): Promise<void> => {
    const dir = path.join(root, name)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, "SKILL.md"), body, "utf8")
  }

  it("searches by name, tags, and category", async () => {
    await writeSkill(
      "alpha",
      "---\nname: alpha\ndescription: Does alpha things\ncategory: engineering\ntags: java, api\nversion: 1.0.0\nsourceId: just-do-it-local\n---\n\n# Alpha\n",
    )
    await writeSkill(
      "beta",
      "---\nname: beta\ndescription: Something else\ncategory: domain\ntags: booking\nsourceId: just-do-it-local\n---\n\n# Beta\n",
    )

    const catalog = new SkillCatalog({ catalogPath: root, manifest: localManifest })
    const all = await catalog.search({ query: "", limit: 20 })
    expect(all).toHaveLength(2)
    // Search returns summaries only — no skill bodies in the agent-facing payload.
    expect(all.every((item) => !("content" in item))).toBe(true)

    const hits = await catalog.search({ query: "alpha", limit: 20 })
    expect(hits).toHaveLength(1)
    expect(hits[0]?.id).toBe("alpha")
    expect(hits[0]?.tags).toEqual(["java", "api"])
    expect(hits[0]?.provenance.sourceId).toBe("just-do-it-local")
    expect(hits[0]?.provenance.sourceUrl).toBe("https://example.invalid/just-do-it")
    expect(hits[0]?.version).toBe("1.0.0")

    const byCategory = await catalog.search({ query: "", category: "domain", limit: 20 })
    expect(byCategory.map((item) => item.id)).toEqual(["beta"])
  })

  it("returns sha256 digest and provenance on read", async () => {
    const content =
      "---\nname: gamma\ndescription: g\nversion: 2.0.0\nsourceId: just-do-it-local\n---\n\nbody\n"
    await writeSkill("gamma", content)
    const catalog = new SkillCatalog({ catalogPath: root, manifest: localManifest })
    const skill = await catalog.read("gamma")

    expect(skill.content).toBe(content)
    expect(skill.sha256).toBe(createHash("sha256").update(content, "utf8").digest("hex"))
    expect(skill.bytes).toBe(Buffer.byteLength(content, "utf8"))
    expect(skill.version).toBe("2.0.0")
    expect(skill.provenance.license).toBe("MIT")
    expect(skill.provenance.sourceUrl).toBe("https://example.invalid/just-do-it")
    expect(skill.provenance.commitOrRelease).toBe("2.0.0")
  })

  it("enforces optional version pin on read", async () => {
    await writeSkill(
      "pinned",
      "---\nname: pinned\ndescription: p\nversion: 3.1.0\nsourceId: just-do-it-local\n---\n\nbody\n",
    )
    const catalog = new SkillCatalog({ catalogPath: root, manifest: localManifest })
    await expect(catalog.read("pinned", "3.1.0")).resolves.toMatchObject({ version: "3.1.0" })
    await expect(catalog.read("pinned", "9.9.9")).rejects.toThrow(/Version mismatch/)
  })

  it("hides skills whose source fails the import gate", async () => {
    const gatedManifest = parseSourceManifest({
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
    await writeSkill(
      "ok-skill",
      "---\nname: ok-skill\ndescription: ok\nsourceId: just-do-it-local\n---\n\nbody\n",
    )
    await writeSkill(
      "bad-skill",
      "---\nname: bad-skill\ndescription: bad\nsourceId: blocked-source\n---\n\nbody\n",
    )
    const catalog = new SkillCatalog({ catalogPath: root, manifest: gatedManifest })
    const hits = await catalog.search({ query: "", limit: 20 })
    expect(hits.map((item) => item.id)).toEqual(["ok-skill"])
    await expect(catalog.read("bad-skill")).rejects.toThrow(/Skill not found/)
  })

  it("rejects skills missing sourceId (no local default)", async () => {
    await writeSkill(
      "orphan",
      "---\nname: orphan\ndescription: no source\nversion: 1.0.0\n---\n\nbody\n",
    )
    const catalog = new SkillCatalog({ catalogPath: root, manifest: localManifest })
    expect(await catalog.search({ query: "", limit: 10 })).toEqual([])
    await expect(catalog.read("orphan")).rejects.toThrow(/Skill not found/)
  })

  it("fails closed when source manifest cannot be loaded", async () => {
    await writeSkill(
      "alpha",
      "---\nname: alpha\ndescription: a\nsourceId: just-do-it-local\n---\n\nbody\n",
    )
    const catalog = new SkillCatalog({
      catalogPath: root,
      manifestPath: path.join(root, "missing-manifest.json"),
    })
    await expect(catalog.search({ query: "", limit: 10 })).rejects.toThrow()
    await expect(catalog.read("alpha")).rejects.toThrow()
  })

  it("rejects path traversal and invalid names", async () => {
    const catalog = new SkillCatalog({ catalogPath: root, manifest: localManifest })
    await expect(catalog.read("../etc")).rejects.toThrow(/Invalid skill name/)
    await expect(catalog.read("missing")).rejects.toThrow(/Skill not found/)
  })

  it("rejects symlink skill files", async () => {
    const real = path.join(root, "real.md")
    await fs.writeFile(real, "secret", "utf8")
    const dir = path.join(root, "linked")
    await fs.mkdir(dir)
    await fs.symlink(real, path.join(dir, "SKILL.md"))

    const catalog = new SkillCatalog({ catalogPath: root, manifest: localManifest })
    expect(await catalog.search({ query: "", limit: 10 })).toEqual([])
    await expect(catalog.read("linked")).rejects.toThrow(/Skill not found/)
  })

  it("rejects symlink skill directories that escape the catalog", async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "just-do-it-outside-"))
    await fs.writeFile(path.join(outside, "SKILL.md"), "SECRET_OUTSIDE\n", "utf8")
    await fs.symlink(outside, path.join(root, "linked-dir"))

    const catalog = new SkillCatalog({ catalogPath: root, manifest: localManifest })
    expect(await catalog.search({ query: "", limit: 10 })).toEqual([])
    await expect(catalog.read("linked-dir")).rejects.toThrow(/Skill not found/)
    await fs.rm(outside, { recursive: true, force: true })
  })

  it("enforces max skill size", async () => {
    await writeSkill("huge", "x".repeat(100))
    const catalog = new SkillCatalog({
      catalogPath: root,
      maxSkillBytes: 10,
      manifest: localManifest,
    })
    await expect(catalog.read("huge")).rejects.toThrow(/size limit/)
  })

  it("reads VERSION in just_do_it_version payload", async () => {
    const catalog = new SkillCatalog({ catalogPath: root, manifest: localManifest })
    expect((await catalog.version()).catalogVersion).toBe("unversioned")
    await fs.writeFile(path.join(root, "VERSION"), "1.2.3\n", "utf8")
    const info = await catalog.version()
    expect(info.catalogVersion).toBe("1.2.3")
    expect(info.capabilities).toContain("search_skills")
  })

  it("skips malformed directories without breaking search", async () => {
    await writeSkill(
      "ok",
      "---\nname: ok\ndescription: fine\nsourceId: just-do-it-local\n---\n",
    )
    await fs.mkdir(path.join(root, "broken"))
    const catalog = new SkillCatalog({ catalogPath: root, manifest: localManifest })
    expect(await catalog.search({ query: "", limit: 10 })).toHaveLength(1)
  })
})
