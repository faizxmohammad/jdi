import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import type { AdapterId } from "./adapters.js"
import { ensureDirectory } from "./paths.js"

export interface ManagedInstall {
  skillId: string
  version: string
  sha256: string
  sourceId: string
  pinned: boolean
  pinnedVersion?: string
  installedAt: string
  updatedAt: string
}

export interface AdapterState {
  adapterId: AdapterId
  version: 1
  installs: Record<string, ManagedInstall>
}

export interface StatePaths {
  stateRoot: string
  stateFile: string
  snapshotsRoot: string
}

export interface StateOptions {
  home?: string
  stateRoot?: string
}

export const resolveStatePaths = (adapterId: AdapterId, options?: StateOptions): StatePaths => {
  const home = options?.home ?? process.env.JUST_DO_IT_HOME ?? os.homedir()
  const stateRoot =
    options?.stateRoot ??
    (process.env.JUST_DO_IT_STATE_ROOT
      ? path.resolve(process.env.JUST_DO_IT_STATE_ROOT)
      : path.join(home, ".just-do-it"))
  return {
    stateRoot,
    stateFile: path.join(stateRoot, "state", `${adapterId}.json`),
    snapshotsRoot: path.join(stateRoot, "snapshots", adapterId),
  }
}

const emptyState = (adapterId: AdapterId): AdapterState => ({
  adapterId,
  version: 1,
  installs: {},
})

export const loadAdapterState = async (
  adapterId: AdapterId,
  options?: StateOptions,
): Promise<AdapterState> => {
  const { stateFile } = resolveStatePaths(adapterId, options)
  const raw = await fs.readFile(stateFile, "utf8").catch(() => undefined)
  if (!raw) return emptyState(adapterId)
  try {
    const parsed = JSON.parse(raw) as AdapterState
    if (parsed.adapterId !== adapterId || parsed.version !== 1 || !parsed.installs) {
      return emptyState(adapterId)
    }
    return parsed
  } catch {
    return emptyState(adapterId)
  }
}

export const saveAdapterState = async (
  state: AdapterState,
  options?: StateOptions,
): Promise<void> => {
  const { stateFile } = resolveStatePaths(state.adapterId, options)
  await ensureDirectory(path.dirname(stateFile))
  await fs.writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8")
}

export const isManaged = (state: AdapterState, skillId: string): boolean =>
  Boolean(state.installs[skillId])

export interface SnapshotResult {
  snapshotId: string
  path: string
}

/** Copy existing skill directory into a timestamped snapshot (SKILL.md only for MVP). */
export const createSnapshot = async (
  adapterId: AdapterId,
  skillId: string,
  skillDir: string,
  options?: StateOptions,
): Promise<SnapshotResult | undefined> => {
  const skillFile = path.join(skillDir, "SKILL.md")
  const content = await fs.readFile(skillFile, "utf8").catch(() => undefined)
  if (content === undefined) return undefined

  const snapshotId = new Date().toISOString().replace(/[:.]/g, "-")
  const { snapshotsRoot } = resolveStatePaths(adapterId, options)
  const destDir = path.join(snapshotsRoot, skillId, snapshotId)
  await ensureDirectory(destDir)
  await fs.writeFile(path.join(destDir, "SKILL.md"), content, "utf8")
  return { snapshotId, path: destDir }
}

export const listSnapshots = async (
  adapterId: AdapterId,
  skillId: string,
  options?: StateOptions,
): Promise<string[]> => {
  const { snapshotsRoot } = resolveStatePaths(adapterId, options)
  const dir = path.join(snapshotsRoot, skillId)
  const entries = await fs.readdir(dir).catch(() => [])
  return entries.sort().reverse()
}

export const readLatestSnapshot = async (
  adapterId: AdapterId,
  skillId: string,
  options?: StateOptions,
): Promise<{ snapshotId: string; content: string } | undefined> => {
  const ids = await listSnapshots(adapterId, skillId, options)
  const snapshotId = ids[0]
  if (!snapshotId) return undefined
  const { snapshotsRoot } = resolveStatePaths(adapterId, options)
  const content = await fs.readFile(
    path.join(snapshotsRoot, skillId, snapshotId, "SKILL.md"),
    "utf8",
  )
  return { snapshotId, content }
}
