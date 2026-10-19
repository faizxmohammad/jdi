# Phase 4 proposal — Skill synchronization and external integrations

Date: 2026-10-19  
Author: Agent 1 (Implementation Lead)  
Roadmap: `docs/implementation.md` §6 Phase 4

## Problem understanding

Phase 4 exit gate needs:

1. Installation, update, and rollback work on clean test environments
2. External dependencies clearly distinguished from installed capabilities
3. No skill script executed implicitly by the registry

Existing baseline:

| Piece | Status | Gap vs Phase 4 |
|---|---|---|
| Catalog + import gate | Done (Phase 1) | Gate is for *catalog* import, not client install |
| `npm run import-skill` | Done | Copies into repo `skills/`; not client sync |
| `scripts/sync-claude-skills.sh` | Done | Claude-only; no preview/pin/update/rollback; overwrite refuse only |
| Cursor skills path | Undocumented convention | No adapter |
| External deps (local tooling) | Manifest `metadata_only` | No prerequisite check / setup guidance CLI |
| Path safety | Catalog read hardened | Need same for client target writes |

## Assumptions

1. Phase 4 = **local** filesystem sync from authorized catalog skills → client skill directories. No OAuth, no public hosting (Phase 5).
2. Only skills whose `sourceId` passes `evaluateImportGate` may be installed to clients. `pending_audit` / `metadata_only` / etc. stay blocked as installable skill content.
3. `cli_integration` / `external_mcp` / `plugin_integration` / `composite_workflow` are **guidance + prerequisite checks**, not copied as portable `SKILL.md` installs (unless a future approved instruction_skill wraps them).
4. “Pin” = record desired `version` in local install state; update refuses to change a pinned skill unless `--unpin` or pin updated.
5. Rollback restores the last pre-change snapshot for that skill under the target adapter (not Git history).
6. No arbitrary shell execution of skill scripts or attack tooling. Dep checks may run safe, non-destructive probes (`command -v`, version flags) only.
7. Legacy `sync-claude-skills.sh` remains as a thin wrapper or documented fallback; preferred path is the new CLI.

→ Correct me now or proceed with these.

## Approaches considered

### A — New `just-do-it` sync CLI + client adapters (preferred)

Add `npm run just-do-it -- <command>` with:

1. **Adapters** — `ClientAdapter` interface: `id`, resolve root, list installed, resolve skill dir. Concrete: `claude-code` → `~/.claude/skills` (override `JUST_DO_IT_CLAUDE_SKILLS`); `cursor` → `~/.cursor/skills` (override `JUST_DO_IT_CURSOR_SKILLS`).
2. **Path safety** — validate skill ids; contain all writes under adapter root; reject symlink dirs/files for sources and destinations; refuse path escape / `..`.
3. **Preview** — dry-run mode emits structured plan: create / update / skip / refuse (user-owned) with content digests.
4. **Install state** — `~/.just-do-it/state/<adapterId>.json` tracks managed installs (skillId, version, sha256, pinned, installedAt). Snapshots under `~/.just-do-it/snapshots/<adapterId>/<skillId>/<iso>/`.
5. **Workflows** — `list`, `install`, `pin`, `update`, `remove`, `rollback`, `preview` (or `--preview` on mutating cmds), `deps` / `integrations`.
6. **Overwrite policy** — install into empty slot OK; identical content → no-op; different content without managed marker → **refuse** (preserve user-owned); managed → update with snapshot first.
7. **Integration registry** — JSON/TS registry for local tooling checks (+ other metadata_only externals): install guidance text, prerequisite checks, `compatibilityStatus`, `validatedAt`. Never claim capability installed when only guidance shown.
8. **Reuse** — `evaluateImportGate`, `readSkillFile`, `listSkillDirectories`, manifest load.

- Pros: Matches scope; clean separation from catalog import; testable with temp HOME roots
- Cons: More surface than extending bash script

### B — Extend `import-skill` CLI with `--target`

Fold sync into import CLI.

- Pros: One binary
- Cons: Conflates catalog import vs client install; awkward UX; harder to keep import gate semantics clear

### C — Only improve `sync-claude-skills.sh`

- Pros: Tiny
- Cons: No Cursor adapter, no preview/pin/rollback/deps, weak testability — fails exit gate

## Preferred approach + rationale

**Approach A.** Keep Phase 1 `import-skill` for catalog. New sync CLI owns client adapters, preview, rollback, and external-dep guidance. Approach B muddies trust boundaries. Approach C cannot meet the exit gate.

## Out of scope (will not implement)

- Phase 5 OAuth / public hosting / per-user credentials
- Network fetch/clone of catalog candidates for install
- Installing `pending_audit` / unauthorized content as approved skills
- Executing external installers or attack tooling blindly
- Implicit skill-script execution
- MCP write tools for install (CLI only)

## Implementation plan

1. Write this proposal
2. `src/sync/paths.ts` — containment + symlink checks
3. `src/sync/adapters.ts` — claude-code + cursor
4. `src/sync/state.ts` — install state + snapshots
5. `src/sync/preview.ts` + `src/sync/install.ts` — plan/apply/rollback
6. `src/sync/integrations.ts` — local tooling checks registry + dep probes
7. `src/cli/just-do-it.ts` + `npm run just-do-it`
8. Tests: path safety, symlink refuse, overwrite refuse, preview, install/update/rollback, import gate on install, deps distinction
9. Docs: README, known-gaps, client-compatibility, todo; optional thin wrap of sync script
10. typecheck / test / build; lead report (no PASS)

## Success evidence (self-check before Agent 2)

- Clean temp target: install → files present + state managed; update with snapshot → rollback restores prior content
- Preview does not write; refuse overwrites user-owned files
- Symlink / path escape rejected
- Unauthorized source skill cannot install
- `deps` / `integrations` output marks external tooling as external guidance, not installed skills
- No skill script execution in code paths
