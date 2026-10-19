import { promises as fs } from "node:fs"
import path from "node:path"
import { evaluateImportGate, findSourceById } from "../catalog/importPolicy.js"
import { loadSourceManifest } from "../catalog/manifest.js"
import {
  digestContent,
  listSkillDirectories,
  readSkillFile,
  type ParsedSkillFile,
} from "../catalog/skillFiles.js"
import type { ClientAdapter } from "./adapters.js"
import { assertNotSymlink, ensureDirectory } from "./paths.js"
import {
  createSnapshot,
  isManaged,
  loadAdapterState,
  readLatestSnapshot,
  saveAdapterState,
  type AdapterState,
  type ManagedInstall,
  type StateOptions,
} from "./state.js"

export type PlanAction =
  | "create"
  | "update"
  | "noop_identical"
  | "refuse_user_owned"
  | "refuse_gate"
  | "refuse_pin"
  | "refuse_entry_type"
  | "refuse_path"
  | "remove"
  | "rollback"

export interface FileChangePlan {
  path: string
  action: "create" | "update" | "remove" | "unchanged"
  beforeSha256?: string
  afterSha256?: string
}

export interface SyncPlan {
  ok: boolean
  action: PlanAction
  skillId: string
  adapterId: string
  reasons: string[]
  preview: boolean
  changes: FileChangePlan[]
  skill?: {
    version: string
    sha256: string
    sourceId: string
    entryType: string
  }
  applied?: boolean
  snapshotId?: string
  note?: string
}

export interface SyncOptions {
  catalogPath: string
  adapter: ClientAdapter
  preview?: boolean
  unpin?: boolean
  manifestPath?: string
  maxSkillBytes?: number
  state?: StateOptions
}

const PORTABLE_ENTRY_TYPES = new Set(["instruction_skill", "reference_collection"])

const readTargetSkillMd = async (skillDir: string): Promise<string | undefined> => {
  const filePath = path.join(skillDir, "SKILL.md")
  const linkCheck = await assertNotSymlink(filePath)
  if (!linkCheck.ok) return undefined
  return fs.readFile(filePath, "utf8").catch(() => undefined)
}

const loadCatalogSkill = async (
  options: SyncOptions,
  skillId: string,
): Promise<{ skill?: ParsedSkillFile; reasons: string[] }> => {
  const readOptions: { maxSkillBytes?: number } = {}
  if (options.maxSkillBytes !== undefined) readOptions.maxSkillBytes = options.maxSkillBytes
  const { skill, issues } = await readSkillFile(options.catalogPath, skillId, readOptions)
  if (!skill) {
    return {
      reasons: issues.map((i) => i.message).concat(issues.length ? [] : [`skill not found: ${skillId}`]),
    }
  }
  return { skill, reasons: [] }
}

const gateForSkill = async (
  skill: ParsedSkillFile,
  manifestPath?: string,
): Promise<{ allowed: boolean; reasons: string[] }> => {
  const manifest = await loadSourceManifest(manifestPath)
  const source = findSourceById(manifest.sources, skill.sourceId)
  return evaluateImportGate(source)
}

const buildManaged = (skill: ParsedSkillFile, prior?: ManagedInstall): ManagedInstall => {
  const now = new Date().toISOString()
  const pinned = prior?.pinned ?? false
  const pinnedVersion = prior?.pinnedVersion
  return {
    skillId: skill.id,
    version: skill.version,
    sha256: skill.sha256,
    sourceId: skill.sourceId,
    pinned,
    ...(pinned && pinnedVersion ? { pinnedVersion } : {}),
    installedAt: prior?.installedAt ?? now,
    updatedAt: now,
  }
}

export const planInstall = async (skillId: string, options: SyncOptions): Promise<SyncPlan> => {
  const preview = options.preview ?? false
  const base: SyncPlan = {
    ok: false,
    action: "refuse_path",
    skillId,
    adapterId: options.adapter.id,
    reasons: [],
    preview,
    changes: [],
  }

  const loaded = await loadCatalogSkill(options, skillId)
  if (!loaded.skill) {
    return { ...base, reasons: loaded.reasons }
  }
  const skill = loaded.skill

  if (!PORTABLE_ENTRY_TYPES.has(skill.entryType)) {
    return {
      ...base,
      action: "refuse_entry_type",
      reasons: [
        `entryType ${skill.entryType} is not a portable skill install`,
      ],
      skill: {
        version: skill.version,
        sha256: skill.sha256,
        sourceId: skill.sourceId,
        entryType: skill.entryType,
      },
    }
  }

  const gate = await gateForSkill(skill, options.manifestPath)
  if (!gate.allowed) {
    return {
      ...base,
      action: "refuse_gate",
      reasons: gate.reasons,
      skill: {
        version: skill.version,
        sha256: skill.sha256,
        sourceId: skill.sourceId,
        entryType: skill.entryType,
      },
    }
  }

  const dest = await options.adapter.skillDir(skillId)
  if (!dest.ok) {
    return { ...base, action: "refuse_path", reasons: [dest.reason] }
  }

  const state = await loadAdapterState(options.adapter.id, options.state)
  const existing = await readTargetSkillMd(dest.path)
  const targetFile = path.join(dest.path, "SKILL.md")

  if (existing !== undefined) {
    const beforeSha = digestContent(existing)
    if (beforeSha === skill.sha256) {
      return {
        ...base,
        ok: true,
        action: "noop_identical",
        reasons: [],
        note: "already installed with identical content",
        skill: {
          version: skill.version,
          sha256: skill.sha256,
          sourceId: skill.sourceId,
          entryType: skill.entryType,
        },
        changes: [
          {
            path: targetFile,
            action: "unchanged",
            beforeSha256: beforeSha,
            afterSha256: skill.sha256,
          },
        ],
      }
    }

    if (!isManaged(state, skillId)) {
      return {
        ...base,
        action: "refuse_user_owned",
        reasons: [
          `refusing to overwrite user-owned skill at ${dest.path} (not managed by just-do-it)`,
        ],
        skill: {
          version: skill.version,
          sha256: skill.sha256,
          sourceId: skill.sourceId,
          entryType: skill.entryType,
        },
        changes: [
          {
            path: targetFile,
            action: "unchanged",
            beforeSha256: beforeSha,
            afterSha256: skill.sha256,
          },
        ],
      }
    }

    const managed = state.installs[skillId]
    if (managed?.pinned && !options.unpin) {
      const pin = managed.pinnedVersion ?? managed.version
      if (pin !== skill.version) {
        return {
          ...base,
          action: "refuse_pin",
          reasons: [
            `skill pinned to version ${pin}; catalog has ${skill.version}. Unpin or update pin first.`,
          ],
          skill: {
            version: skill.version,
            sha256: skill.sha256,
            sourceId: skill.sourceId,
            entryType: skill.entryType,
          },
        }
      }
    }

    return {
      ...base,
      ok: true,
      action: "update",
      reasons: [],
      skill: {
        version: skill.version,
        sha256: skill.sha256,
        sourceId: skill.sourceId,
        entryType: skill.entryType,
      },
      changes: [
        {
          path: targetFile,
          action: "update",
          beforeSha256: beforeSha,
          afterSha256: skill.sha256,
        },
      ],
    }
  }

  return {
    ...base,
    ok: true,
    action: "create",
    reasons: [],
    skill: {
      version: skill.version,
      sha256: skill.sha256,
      sourceId: skill.sourceId,
      entryType: skill.entryType,
    },
    changes: [
      {
        path: targetFile,
        action: "create",
        afterSha256: skill.sha256,
      },
    ],
  }
}

export const applyInstall = async (skillId: string, options: SyncOptions): Promise<SyncPlan> => {
  const plan = await planInstall(skillId, options)
  if (!plan.ok) return plan
  if (plan.action === "noop_identical") {
    // Ensure state marks managed even if file pre-existed identical
    const loaded = await loadCatalogSkill(options, skillId)
    if (loaded.skill) {
      const state = await loadAdapterState(options.adapter.id, options.state)
      if (!isManaged(state, skillId) && !options.preview) {
        state.installs[skillId] = buildManaged(loaded.skill)
        await saveAdapterState(state, options.state)
      }
    }
    return { ...plan, applied: false }
  }

  if (options.preview) {
    return { ...plan, applied: false }
  }

  const loaded = await loadCatalogSkill(options, skillId)
  if (!loaded.skill) return { ...plan, ok: false, reasons: loaded.reasons, applied: false }

  const dest = await options.adapter.skillDir(skillId)
  if (!dest.ok) {
    return { ...plan, ok: false, action: "refuse_path", reasons: [dest.reason], applied: false }
  }

  let snapshotId: string | undefined
  if (plan.action === "update") {
    const snap = await createSnapshot(options.adapter.id, skillId, dest.path, options.state)
    snapshotId = snap?.snapshotId
  }

  await ensureDirectory(dest.path)
  const targetFile = path.join(dest.path, "SKILL.md")
  const linkCheck = await assertNotSymlink(targetFile)
  if (!linkCheck.ok) {
    return {
      ...plan,
      ok: false,
      action: "refuse_path",
      reasons: [linkCheck.reason ?? "symlink refused"],
      applied: false,
    }
  }

  await fs.writeFile(targetFile, loaded.skill.content, "utf8")

  const state = await loadAdapterState(options.adapter.id, options.state)
  const prior = state.installs[skillId]
  const next = buildManaged(loaded.skill, prior)
  if (options.unpin) {
    next.pinned = false
    delete next.pinnedVersion
  }
  state.installs[skillId] = next
  await saveAdapterState(state, options.state)

  return { ...plan, applied: true, ...(snapshotId ? { snapshotId } : {}) }
}

export const planRemove = async (skillId: string, options: SyncOptions): Promise<SyncPlan> => {
  const preview = options.preview ?? false
  const dest = await options.adapter.skillDir(skillId)
  if (!dest.ok) {
    return {
      ok: false,
      action: "refuse_path",
      skillId,
      adapterId: options.adapter.id,
      reasons: [dest.reason],
      preview,
      changes: [],
    }
  }

  const state = await loadAdapterState(options.adapter.id, options.state)
  const existing = await readTargetSkillMd(dest.path)
  if (existing === undefined) {
    return {
      ok: true,
      action: "noop_identical",
      skillId,
      adapterId: options.adapter.id,
      reasons: [],
      preview,
      changes: [],
      note: "not installed",
    }
  }

  if (!isManaged(state, skillId)) {
    return {
      ok: false,
      action: "refuse_user_owned",
      skillId,
      adapterId: options.adapter.id,
      reasons: [`refusing to remove user-owned skill at ${dest.path}`],
      preview,
      changes: [],
    }
  }

  return {
    ok: true,
    action: "remove",
    skillId,
    adapterId: options.adapter.id,
    reasons: [],
    preview,
    changes: [
      {
        path: path.join(dest.path, "SKILL.md"),
        action: "remove",
        beforeSha256: digestContent(existing),
      },
    ],
  }
}

export const applyRemove = async (skillId: string, options: SyncOptions): Promise<SyncPlan> => {
  const plan = await planRemove(skillId, options)
  if (!plan.ok || plan.action !== "remove") return plan
  if (options.preview) return { ...plan, applied: false }

  const dest = await options.adapter.skillDir(skillId)
  if (!dest.ok) {
    return { ...plan, ok: false, reasons: [dest.reason], applied: false }
  }

  const snap = await createSnapshot(options.adapter.id, skillId, dest.path, options.state)
  await fs.rm(dest.path, { recursive: true, force: true })

  const state = await loadAdapterState(options.adapter.id, options.state)
  delete state.installs[skillId]
  await saveAdapterState(state, options.state)

  return {
    ...plan,
    applied: true,
    ...(snap?.snapshotId ? { snapshotId: snap.snapshotId } : {}),
  }
}

export const applyRollback = async (skillId: string, options: SyncOptions): Promise<SyncPlan> => {
  const preview = options.preview ?? false
  const dest = await options.adapter.skillDir(skillId)
  if (!dest.ok) {
    return {
      ok: false,
      action: "refuse_path",
      skillId,
      adapterId: options.adapter.id,
      reasons: [dest.reason],
      preview,
      changes: [],
    }
  }

  const snapshot = await readLatestSnapshot(options.adapter.id, skillId, options.state)
  if (!snapshot) {
    return {
      ok: false,
      action: "rollback",
      skillId,
      adapterId: options.adapter.id,
      reasons: ["no snapshot available for rollback"],
      preview,
      changes: [],
    }
  }

  const targetFile = path.join(dest.path, "SKILL.md")
  const linkCheck = await assertNotSymlink(targetFile)
  if (!linkCheck.ok) {
    return {
      ok: false,
      action: "refuse_path",
      skillId,
      adapterId: options.adapter.id,
      reasons: [linkCheck.reason ?? "symlink refused"],
      preview,
      changes: [],
    }
  }

  const state = await loadAdapterState(options.adapter.id, options.state)
  const existing = await readTargetSkillMd(dest.path)
  // Preserve user-owned files: only overwrite when managed, or recreate when absent
  // (e.g. after managed remove left a snapshot).
  if (existing !== undefined && !isManaged(state, skillId)) {
    return {
      ok: false,
      action: "refuse_user_owned",
      skillId,
      adapterId: options.adapter.id,
      reasons: [
        `refusing to rollback over user-owned skill at ${dest.path} (not managed by just-do-it)`,
      ],
      preview,
      changes: [],
      snapshotId: snapshot.snapshotId,
    }
  }

  const afterSha = digestContent(snapshot.content)
  const changes: FileChangePlan[] = [
    {
      path: targetFile,
      action: existing === undefined ? "create" : "update",
      ...(existing !== undefined ? { beforeSha256: digestContent(existing) } : {}),
      afterSha256: afterSha,
    },
  ]

  if (preview) {
    return {
      ok: true,
      action: "rollback",
      skillId,
      adapterId: options.adapter.id,
      reasons: [],
      preview: true,
      changes,
      snapshotId: snapshot.snapshotId,
      applied: false,
    }
  }

  await ensureDirectory(dest.path)
  await fs.writeFile(targetFile, snapshot.content, "utf8")

  const prior = state.installs[skillId]
  const now = new Date().toISOString()
  state.installs[skillId] = {
    skillId,
    version: prior?.version ?? "restored",
    sha256: afterSha,
    sourceId: prior?.sourceId ?? "unknown",
    pinned: prior?.pinned ?? false,
    ...(prior?.pinnedVersion ? { pinnedVersion: prior.pinnedVersion } : {}),
    installedAt: prior?.installedAt ?? now,
    updatedAt: now,
  }
  await saveAdapterState(state, options.state)

  return {
    ok: true,
    action: "rollback",
    skillId,
    adapterId: options.adapter.id,
    reasons: [],
    preview: false,
    changes,
    snapshotId: snapshot.snapshotId,
    applied: true,
    note: "restored latest snapshot",
  }
}

export const pinSkill = async (
  skillId: string,
  version: string | undefined,
  options: SyncOptions,
): Promise<{ ok: boolean; state?: AdapterState; reasons: string[] }> => {
  const state = await loadAdapterState(options.adapter.id, options.state)
  const managed = state.installs[skillId]
  if (!managed) {
    return { ok: false, reasons: [`skill ${skillId} is not installed/managed on ${options.adapter.id}`] }
  }
  managed.pinned = true
  managed.pinnedVersion = version ?? managed.version
  managed.updatedAt = new Date().toISOString()
  state.installs[skillId] = managed
  await saveAdapterState(state, options.state)
  return { ok: true, state, reasons: [] }
}

export const unpinSkill = async (
  skillId: string,
  options: SyncOptions,
): Promise<{ ok: boolean; reasons: string[] }> => {
  const state = await loadAdapterState(options.adapter.id, options.state)
  const managed = state.installs[skillId]
  if (!managed) {
    return { ok: false, reasons: [`skill ${skillId} is not installed/managed on ${options.adapter.id}`] }
  }
  managed.pinned = false
  delete managed.pinnedVersion
  managed.updatedAt = new Date().toISOString()
  state.installs[skillId] = managed
  await saveAdapterState(state, options.state)
  return { ok: true, reasons: [] }
}

export interface ListEntry {
  skillId: string
  inCatalog: boolean
  installed: boolean
  managed: boolean
  version?: string
  pinned?: boolean
  pinnedVersion?: string
  sha256?: string
  sourceId?: string
  entryType?: string
}

export const listSyncStatus = async (options: SyncOptions): Promise<ListEntry[]> => {
  const catalogIds = await listSkillDirectories(options.catalogPath)
  const installedIds = await options.adapter.listInstalledIds()
  const state = await loadAdapterState(options.adapter.id, options.state)
  const all = new Set([...catalogIds, ...installedIds, ...Object.keys(state.installs)])

  const entries: ListEntry[] = []
  for (const skillId of [...all].sort()) {
    const inCatalog = catalogIds.includes(skillId)
    const installed = installedIds.includes(skillId)
    const managed = isManaged(state, skillId)
    const record: ListEntry = { skillId, inCatalog, installed, managed }

    if (inCatalog) {
      const { skill } = await readSkillFile(options.catalogPath, skillId)
      if (skill) {
        record.version = skill.version
        record.sha256 = skill.sha256
        record.sourceId = skill.sourceId
        record.entryType = skill.entryType
      }
    }

    const m = state.installs[skillId]
    if (m) {
      record.pinned = m.pinned
      if (m.pinnedVersion) record.pinnedVersion = m.pinnedVersion
      if (!record.version) record.version = m.version
      if (!record.sha256) record.sha256 = m.sha256
      if (!record.sourceId) record.sourceId = m.sourceId
    }

    entries.push(record)
  }
  return entries
}
