import { promises as fs } from "node:fs"
import path from "node:path"
import { SKILL_NAME } from "../catalog/skillFiles.js"

export interface PathSafetyResult {
  ok: boolean
  reason?: string
  resolved?: string
}

/** Ensure skillId is a single safe directory name (no separators / traversal). */
export const assertSafeSkillId = (skillId: string): PathSafetyResult => {
  if (!SKILL_NAME.test(skillId)) {
    return { ok: false, reason: `invalid skill id: ${skillId}` }
  }
  if (skillId.includes("/") || skillId.includes("\\") || skillId.includes("..")) {
    return { ok: false, reason: `skill id contains path separators: ${skillId}` }
  }
  return { ok: true, resolved: skillId }
}

/**
 * Resolve `candidate` under `root` and require containment.
 * Rejects if the resolved path escapes root (string prefix + realpath when present).
 */
export const resolveContainedPath = async (
  root: string,
  ...segments: string[]
): Promise<PathSafetyResult> => {
  const base = path.resolve(root)
  const candidate = path.resolve(base, ...segments)
  if (candidate !== base && !candidate.startsWith(`${base}${path.sep}`)) {
    return { ok: false, reason: `path escapes root: ${segments.join("/")}` }
  }

  const baseExists = await fs.stat(base).catch(() => undefined)
  if (baseExists) {
    const realBase = await fs.realpath(base)
    const candidateExists = await fs.lstat(candidate).catch(() => undefined)
    if (candidateExists) {
      if (candidateExists.isSymbolicLink()) {
        return { ok: false, reason: `symlink refused: ${segments.join("/")}` }
      }
      const realCandidate = await fs.realpath(candidate)
      if (realCandidate !== realBase && !realCandidate.startsWith(`${realBase}${path.sep}`)) {
        return { ok: false, reason: `realpath escapes root: ${segments.join("/")}` }
      }
      return { ok: true, resolved: realCandidate }
    }
    // Parent must stay under root when creating new paths
    const parent = path.dirname(candidate)
    const parentExists = await fs.stat(parent).catch(() => undefined)
    if (parentExists) {
      const realParent = await fs.realpath(parent)
      if (realParent !== realBase && !realParent.startsWith(`${realBase}${path.sep}`)) {
        return { ok: false, reason: `parent realpath escapes root: ${segments.join("/")}` }
      }
    }
  }

  return { ok: true, resolved: candidate }
}

/** Reject symlink directories and files (lstat). */
export const assertNotSymlink = async (targetPath: string): Promise<PathSafetyResult> => {
  const stat = await fs.lstat(targetPath).catch(() => undefined)
  if (!stat) return { ok: true, resolved: targetPath }
  if (stat.isSymbolicLink()) {
    return { ok: false, reason: `symlink refused: ${targetPath}` }
  }
  return { ok: true, resolved: targetPath }
}

export const ensureDirectory = async (dirPath: string): Promise<void> => {
  await fs.mkdir(dirPath, { recursive: true })
}
