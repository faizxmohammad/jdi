import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { assertNotSymlink, assertSafeSkillId, resolveContainedPath } from "./paths.js"

export type AdapterId = "claude-code" | "cursor"

export interface ClientAdapter {
  id: AdapterId
  label: string
  /** Absolute skills root for this client. */
  root: string
  skillDir: (skillId: string) => Promise<{ ok: true; path: string } | { ok: false; reason: string }>
  listInstalledIds: () => Promise<string[]>
}

export interface AdapterOptions {
  home?: string
  claudeSkillsRoot?: string
  cursorSkillsRoot?: string
}

const defaultHome = (options?: AdapterOptions): string =>
  options?.home ?? process.env.JUST_DO_IT_HOME ?? os.homedir()

export const resolveClaudeSkillsRoot = (options?: AdapterOptions): string => {
  if (options?.claudeSkillsRoot) return path.resolve(options.claudeSkillsRoot)
  if (process.env.JUST_DO_IT_CLAUDE_SKILLS) return path.resolve(process.env.JUST_DO_IT_CLAUDE_SKILLS)
  return path.join(defaultHome(options), ".claude", "skills")
}

export const resolveCursorSkillsRoot = (options?: AdapterOptions): string => {
  if (options?.cursorSkillsRoot) return path.resolve(options.cursorSkillsRoot)
  if (process.env.JUST_DO_IT_CURSOR_SKILLS) return path.resolve(process.env.JUST_DO_IT_CURSOR_SKILLS)
  return path.join(defaultHome(options), ".cursor", "skills")
}

const makeAdapter = (id: AdapterId, label: string, root: string): ClientAdapter => {
  const skillDir = async (
    skillId: string,
  ): Promise<{ ok: true; path: string } | { ok: false; reason: string }> => {
    const idCheck = assertSafeSkillId(skillId)
    if (!idCheck.ok) return { ok: false, reason: idCheck.reason ?? "invalid skill id" }

    const contained = await resolveContainedPath(root, skillId)
    if (!contained.ok || !contained.resolved) {
      return { ok: false, reason: contained.reason ?? "path not contained" }
    }

    const linkCheck = await assertNotSymlink(contained.resolved)
    if (!linkCheck.ok) return { ok: false, reason: linkCheck.reason ?? "symlink refused" }

    return { ok: true, path: contained.resolved }
  }

  const listInstalledIds = async (): Promise<string[]> => {
    let entries
    try {
      entries = await fs.readdir(root, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
      throw error
    }

    const ids: string[] = []
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue
      const idCheck = assertSafeSkillId(entry.name)
      if (!idCheck.ok) continue
      const skillMd = path.join(root, entry.name, "SKILL.md")
      const stat = await fs.lstat(skillMd).catch(() => undefined)
      if (!stat?.isFile() || stat.isSymbolicLink()) continue
      ids.push(entry.name)
    }
    return ids.sort((a, b) => a.localeCompare(b))
  }

  return { id, label, root, skillDir, listInstalledIds }
}

export const getAdapter = (id: AdapterId, options?: AdapterOptions): ClientAdapter => {
  if (id === "claude-code") {
    return makeAdapter("claude-code", "Claude Code", resolveClaudeSkillsRoot(options))
  }
  return makeAdapter("cursor", "Cursor", resolveCursorSkillsRoot(options))
}

export const parseAdapterId = (raw: string): AdapterId | undefined => {
  if (raw === "claude-code" || raw === "claude") return "claude-code"
  if (raw === "cursor") return "cursor"
  return undefined
}
