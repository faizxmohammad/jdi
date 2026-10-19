import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { getAdapter } from "../src/sync/adapters.js"
import {
  applyInstall,
  applyRemove,
  applyRollback,
  listSyncStatus,
  pinSkill,
  planInstall,
} from "../src/sync/install.js"
import { checkIntegration, listIntegrations } from "../src/sync/integrations.js"
import { assertSafeSkillId, resolveContainedPath } from "../src/sync/paths.js"

const skillBody = (
  id: string,
  version = "1.0.0",
  sourceId = "just-do-it-local",
): string =>
  `---
name: ${id}
description: Test skill ${id}
entryType: instruction_skill
version: ${version}
sourceId: ${sourceId}
validationStatus: validated
---

# ${id}
`

describe("sync path safety", () => {
  it("rejects unsafe skill ids", () => {
    expect(assertSafeSkillId("../escape").ok).toBe(false)
    expect(assertSafeSkillId("a/b").ok).toBe(false)
    expect(assertSafeSkillId("good-skill").ok).toBe(true)
  })

  it("rejects paths that escape root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "just-do-it-path-"))
    try {
      const escaped = await resolveContainedPath(root, "..", "outside")
      expect(escaped.ok).toBe(false)
      const ok = await resolveContainedPath(root, "nested", "skill")
      expect(ok.ok).toBe(true)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})

describe("sync install / update / rollback", () => {
  let root: string
  let catalog: string
  let home: string
  let stateRoot: string

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "just-do-it-sync-"))
    catalog = path.join(root, "catalog")
    home = path.join(root, "home")
    stateRoot = path.join(root, "state")
    await fs.mkdir(path.join(catalog, "demo-skill"), { recursive: true })
    await fs.writeFile(
      path.join(catalog, "demo-skill", "SKILL.md"),
      skillBody("demo-skill", "1.0.0"),
      "utf8",
    )
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  const options = (preview = false) => ({
    catalogPath: catalog,
    adapter: getAdapter("claude-code", { home }),
    preview,
    state: { stateRoot },
  })

  it("previews create without writing", async () => {
    const plan = await planInstall("demo-skill", options(true))
    expect(plan.ok).toBe(true)
    expect(plan.action).toBe("create")
    expect(plan.changes[0]?.action).toBe("create")
    const dest = path.join(home, ".claude", "skills", "demo-skill", "SKILL.md")
    await expect(fs.access(dest)).rejects.toBeTruthy()
  })

  it("installs on clean target and lists managed status", async () => {
    const result = await applyInstall("demo-skill", options(false))
    expect(result.ok).toBe(true)
    expect(result.applied).toBe(true)
    const dest = path.join(home, ".claude", "skills", "demo-skill", "SKILL.md")
    await expect(fs.readFile(dest, "utf8")).resolves.toContain("demo-skill")

    const list = await listSyncStatus(options(false))
    const entry = list.find((e) => e.skillId === "demo-skill")
    expect(entry?.installed).toBe(true)
    expect(entry?.managed).toBe(true)
  })

  it("refuses to overwrite user-owned files", async () => {
    const destDir = path.join(home, ".claude", "skills", "demo-skill")
    await fs.mkdir(destDir, { recursive: true })
    await fs.writeFile(path.join(destDir, "SKILL.md"), "# user owned\n", "utf8")

    const plan = await planInstall("demo-skill", options(true))
    expect(plan.ok).toBe(false)
    expect(plan.action).toBe("refuse_user_owned")
  })

  it("refuses symlink destination directories", async () => {
    const outside = path.join(root, "outside-target")
    await fs.mkdir(outside, { recursive: true })
    const skillsRoot = path.join(home, ".claude", "skills")
    await fs.mkdir(skillsRoot, { recursive: true })
    await fs.symlink(outside, path.join(skillsRoot, "demo-skill"))

    const plan = await planInstall("demo-skill", options(true))
    expect(plan.ok).toBe(false)
    expect(plan.action).toBe("refuse_path")
    expect(plan.reasons.some((r) => r.includes("symlink"))).toBe(true)
  })

  it("updates managed install with snapshot and rollback", async () => {
    await applyInstall("demo-skill", options(false))

    await fs.writeFile(
      path.join(catalog, "demo-skill", "SKILL.md"),
      skillBody("demo-skill", "2.0.0"),
      "utf8",
    )

    const updated = await applyInstall("demo-skill", options(false))
    expect(updated.ok).toBe(true)
    expect(updated.action).toBe("update")
    expect(updated.snapshotId).toBeTruthy()
    await expect(
      fs.readFile(path.join(home, ".claude", "skills", "demo-skill", "SKILL.md"), "utf8"),
    ).resolves.toContain("2.0.0")

    const rolled = await applyRollback("demo-skill", options(false))
    expect(rolled.ok).toBe(true)
    expect(rolled.applied).toBe(true)
    await expect(
      fs.readFile(path.join(home, ".claude", "skills", "demo-skill", "SKILL.md"), "utf8"),
    ).resolves.toContain("1.0.0")
  })

  it("honors pin during update", async () => {
    await applyInstall("demo-skill", options(false))
    await pinSkill("demo-skill", "1.0.0", options(false))

    await fs.writeFile(
      path.join(catalog, "demo-skill", "SKILL.md"),
      skillBody("demo-skill", "2.0.0"),
      "utf8",
    )

    const blocked = await planInstall("demo-skill", options(true))
    expect(blocked.ok).toBe(false)
    expect(blocked.action).toBe("refuse_pin")

    const forced = await planInstall("demo-skill", { ...options(true), unpin: true })
    expect(forced.ok).toBe(true)
    expect(forced.action).toBe("update")
  })

  it("blocks unauthorized source install", async () => {
    await fs.mkdir(path.join(catalog, "evil"), { recursive: true })
    await fs.writeFile(
      path.join(catalog, "evil", "SKILL.md"),
      skillBody("evil", "1.0.0", "unknown-external-source"),
      "utf8",
    )

    const plan = await planInstall("evil", options(true))
    expect(plan.ok).toBe(false)
    expect(plan.action).toBe("refuse_gate")
  })

  it("removes managed skill and refuses unmanaged remove", async () => {
    await applyInstall("demo-skill", options(false))
    const removed = await applyRemove("demo-skill", options(false))
    expect(removed.ok).toBe(true)
    expect(removed.applied).toBe(true)

    const destDir = path.join(home, ".claude", "skills", "other")
    await fs.mkdir(destDir, { recursive: true })
    await fs.writeFile(path.join(destDir, "SKILL.md"), "# other\n", "utf8")
    const refuse = await applyRemove("other", options(false))
    expect(refuse.ok).toBe(false)
    expect(refuse.action).toBe("refuse_user_owned")
  })

  it("rollback after remove restores when slot empty", async () => {
    await applyInstall("demo-skill", options(false))
    await applyRemove("demo-skill", options(false))
    const dest = path.join(home, ".claude", "skills", "demo-skill", "SKILL.md")
    await expect(fs.access(dest)).rejects.toBeTruthy()

    const rolled = await applyRollback("demo-skill", options(false))
    expect(rolled.ok).toBe(true)
    expect(rolled.applied).toBe(true)
    await expect(fs.readFile(dest, "utf8")).resolves.toContain("demo-skill")
  })

  it("refuses rollback over user-owned skill after remove", async () => {
    await applyInstall("demo-skill", options(false))
    await applyRemove("demo-skill", options(false))

    const destDir = path.join(home, ".claude", "skills", "demo-skill")
    await fs.mkdir(destDir, { recursive: true })
    await fs.writeFile(path.join(destDir, "SKILL.md"), "# USER OWNED\n", "utf8")

    const rolled = await applyRollback("demo-skill", options(false))
    expect(rolled.ok).toBe(false)
    expect(rolled.action).toBe("refuse_user_owned")
    await expect(fs.readFile(path.join(destDir, "SKILL.md"), "utf8")).resolves.toBe(
      "# USER OWNED\n",
    )
  })

  it("refuses rollback when SKILL.md is a symlink", async () => {
    await applyInstall("demo-skill", options(false))
    await fs.writeFile(
      path.join(catalog, "demo-skill", "SKILL.md"),
      skillBody("demo-skill", "2.0.0"),
      "utf8",
    )
    await applyInstall("demo-skill", options(false))

    const skillMd = path.join(home, ".claude", "skills", "demo-skill", "SKILL.md")
    const outside = path.join(root, "outside-skill.md")
    await fs.writeFile(outside, "# outside\n", "utf8")
    await fs.rm(skillMd)
    await fs.symlink(outside, skillMd)

    const rolled = await applyRollback("demo-skill", options(false))
    expect(rolled.ok).toBe(false)
    expect(rolled.action).toBe("refuse_path")
    await expect(fs.readFile(outside, "utf8")).resolves.toBe("# outside\n")
  })

  it("supports cursor adapter root", async () => {
    const cursorRoot = path.join(home, "cursor-skills")
    const cursorOpts = {
      catalogPath: catalog,
      adapter: getAdapter("cursor", { home, cursorSkillsRoot: cursorRoot }),
      preview: false,
      state: { stateRoot },
    }
    const result = await applyInstall("demo-skill", cursorOpts)
    expect(result.ok).toBe(true)
    await expect(
      fs.readFile(path.join(cursorRoot, "demo-skill", "SKILL.md"), "utf8"),
    ).resolves.toContain("demo-skill")
  })
})

describe("integrations registry", () => {
  it("ships with an empty integrations registry by default", () => {
    expect(listIntegrations()).toEqual([])
  })

  it("deps check returns undefined for unknown ids", async () => {
    expect(await checkIntegration("does-not-exist")).toBeUndefined()
  })
})
