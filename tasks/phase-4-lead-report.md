# Phase 4 Lead Report — Skill synchronization and external integrations

**Role:** Agent 1 (Implementation Lead)  
**Date:** 2026-10-19  
**Repo:** `/Users/mohammedfaiz/Desktop/build-my-product-mcp`  
**Roadmap:** `docs/implementation.md` §6 Phase 4  
**Proposal:** `tasks/phase-4-proposal.md`  
**Status:** Implementation complete for Agent 2 review — **does not claim PASS**

---

## 1. Phase and objective

**Phase:** Phase 4 — Skill synchronization and external integrations  

**Objective:** Help users go from discovery to a usable local workflow.

**Exit gate (mandatory — for coordinator after review):**

1. Installation, update, and rollback work on clean test environments  
2. External dependencies are clearly distinguished from installed capabilities  
3. No skill script is executed implicitly by the registry  

---

## 2. Understanding and approach

### Chosen design: Approach A — new `just-do-it` sync CLI + client adapters

| Layer | Choice |
|---|---|
| Catalog import | Keep Phase 1 `npm run import-skill` unchanged |
| Client sync | New `npm run just-do-it` CLI |
| Adapters | `claude-code` → `~/.claude/skills`; `cursor` → `~/.cursor/skills` (env overrides) |
| Gate | Reuse `evaluateImportGate` — never install unauthorized / `pending_audit` as approved |
| Preview | `--preview` / `preview <cmd>` structured plan (create/update/refuse) |
| User-owned | Refuse overwrite/remove when target exists and not managed |
| Rollback | Snapshot `SKILL.md` under `~/.just-do-it/snapshots/<adapter>/<skill>/` before update/remove |
| Externals | Integrations registry + `deps` probes — guidance only, `installedCapability: false` |
| Scripts | Never execute skill scripts; external tooling has manual-only prereqs |

### Approaches considered

| Option | Verdict |
|---|---|
| **A — New sync CLI + adapters** | **Chosen** — clear trust boundary vs catalog import; testable temp HOME |
| B — Extend `import-skill --target` | Rejected — conflates catalog write with client install |
| C — Only improve bash sync script | Rejected — no Cursor adapter, preview, pin, rollback, deps |

### Assumptions (as in proposal)

1. Local filesystem sync only — no Phase 5 OAuth/hosting  
2. Import gate required for client install  
3. Non-portable entry types → integrations guidance, not `SKILL.md` install  
4. Pin stored in local install state  
5. Rollback = latest snapshot, not Git  
6. Dep checks = safe presence probes only  
7. Legacy `sync-claude-skills.sh` wraps CLI when npm available  

---

## 3. Deliverables

| Deliverable | Status | Location |
|---|---|---|
| Proposal before coding | Done | `tasks/phase-4-proposal.md` |
| Path safety | Done | `src/sync/paths.ts` |
| Adapters (Claude Code + Cursor) | Done | `src/sync/adapters.ts` |
| Install state + snapshots | Done | `src/sync/state.ts` |
| Install / update / remove / rollback / pin / list | Done | `src/sync/install.ts` |
| Integrations registry (external tooling) | Done | `src/sync/integrations.ts` |
| CLI | Done | `src/cli/just-do-it.ts`, `npm run just-do-it` |
| Legacy sync wrapper | Done | `scripts/sync-claude-skills.sh` |
| Tests | Done | `tests/sync.test.ts` (13 cases) |
| Docs | Done | README, CONTRIBUTING, `docs/known-gaps.md`, `docs/client-compatibility.md`, `tasks/todo.md` |
| Capability flag | Done | `skill_sync_cli` on `just_do_it_version` |

**Commands:** `list`, `install`, `update`, `remove`, `pin`, `unpin`, `rollback`, `preview …`, `integrations`, `deps [id]`

**Not implemented (correctly out of scope):** Phase 5 OAuth/public hosting; network clone of catalog candidates; executing Playwright installers or external tooling/attack tooling; MCP write tools for sync.

---

## 4. Evidence vs exit gate (self-check)

| Gate | Evidence | Self-check |
|---|---|---|
| Install / update / rollback on clean test env | `tests/sync.test.ts`: clean temp HOME install; managed update creates snapshot; rollback restores `1.0.0` content; CLI smoke install of `java-spring-boot` to temp HOME | Met in tests + CLI smoke |
| External deps ≠ installed capabilities | `integrations` / `deps` always `capabilityKind: "external_dependency"`, `installedCapability: false`; external tooling `metadata_only` + `guidance_only` + `validatedAt: 2026-10-19` | Met |
| No implicit skill script execution | Sync writes `SKILL.md` only; integrations use `command -v` / manual; no `child_process` of skill content | Met by design |

**Additional safety covered in tests:** path escape refuse; symlink refuse; user-owned overwrite refuse; unauthorized source (`pending_audit`) install blocked; pin blocks update unless `--unpin`; Cursor adapter root.

---

## 5. Validation evidence

Commands (2026-10-19):

```text
npm run typecheck   → exit 0
npm test            → 11 files, 72 tests passed (incl. 13 sync)
npm run build       → exit 0
```

CLI smoke (temp HOME):

- `npm run just-do-it -- integrations` → external tooling as external_dependency  
- `npm run just-do-it -- install java-spring-boot --target claude-code --home <tmp> …` → `action: create`, `applied: true`, file present  

---

## 6. Security notes for Agent 2

1. **Import gate reused** — catalog skills with blocked `sourceId` cannot install to clients.  
2. **User-owned preservation** — unmanaged existing dirs are never overwritten or removed.  
3. **Path containment + symlink refuse** — same class of hardening as catalog reads.  
4. **No Phase 5 surfaces** — no OAuth, no public hosting, no arbitrary remote fetch.  
5. **external tooling / security tooling class tools** — guidance + warnings only; external tooling prereqs are `manual` (no auto install/run).  
6. **Residual:** Default Cursor path `~/.cursor/skills` is a convention; operators may need `JUST_DO_IT_CURSOR_SKILLS` if their Cursor build differs. Clean-machine UI verification still human residual (same as Phase 0 MCP clients).

---

## 7. Files touched (summary)

**Added:**

- `src/sync/paths.ts`, `adapters.ts`, `state.ts`, `install.ts`, `integrations.ts`  
- `src/cli/just-do-it.ts`  
- `tests/sync.test.ts`  
- `tasks/phase-4-proposal.md`, `tasks/phase-4-lead-report.md`  

**Updated:**

- `package.json` (`just-do-it` script)  
- `scripts/sync-claude-skills.sh`  
- `src/skills/catalog.ts` (capability)  
- `README.md`, `CONTRIBUTING.md`, `docs/known-gaps.md`, `docs/client-compatibility.md`, `tasks/todo.md`  

---

## 8. Honest residuals / risks

1. Snapshots store `SKILL.md` only (portable skill layout for seed catalog) — multi-file skill packages would need snapshot expansion later.  
2. First install has no rollback snapshot until an update/remove creates one (by design).  
3. `command -v <tool>` probe may be missing even when `npx playwright` works — guidance text documents that.  
4. No CI workflow yet (pre-existing gap).  
5. Human Claude Code / Cursor UI acceptance of installed skills still Unverified.

---

## 9. Handoff to Agent 2

Please review against Phase 4 exit gate and security constraints. Suggested focus:

1. Confirm import gate cannot be bypassed via sync CLI  
2. Confirm overwrite/symlink/path escape behavior  
3. Confirm external tooling never presented as installed skills  
4. Confirm no Phase 5 creep  
5. Re-run `npm run typecheck && npm test && npm run build`  

**Implementation Lead does not claim PASS.** Coordinator issues completion after independent review.
