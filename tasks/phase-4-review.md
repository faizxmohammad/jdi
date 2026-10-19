# Phase 4 Independent Review — Just Do It MCP

**Reviewer:** Agent 2 (Independent Reviewer / Challenger)  
**Date:** 2026-10-19  
**Roadmap:** `docs/implementation.md` §6 Phase 4 + Phase 1 import gate + PRD §6 script-execution ban  
**Proposal reviewed:** `tasks/phase-4-proposal.md` (Approach A — sync CLI + adapters)  
**Lead report:** `tasks/phase-4-lead-report.md` (not treated as PASS)  
**Recommended status:** **PASS** (after High remediations during this review)

---

## Independent assessment

Phase 4’s **exit gate** is met with Agent-2-run evidence:

1. **Install / update / rollback on clean test envs** — temp HOME + state root in `tests/sync.test.ts`; CLI smoke installed `java-spring-boot` under temp `--home` / `--state-root`; update snapshots then rollback restores prior content.
2. **External deps ≠ installed capabilities** — `integrations` / `deps` always `capabilityKind: "external_dependency"`, `installedCapability: false`; external tooling are `metadata_only` + `guidance_only` with `validatedAt`.
3. **No skill script execution** — sync writes `SKILL.md` only; only `child_process` use is `command -v` presence probes via `execFile` + `JSON.stringify` quoting; external tooling prereqs are `manual` only.

Approach A is the right trust-boundary call (catalog import stays Phase 1; client sync is a separate CLI). Import gate is reused on install. Preview refuses writes. Path/symlink hardening largely matches catalog reads. **Do not rubber-stamp the lead report:** rollback could overwrite user-owned files and write through `SKILL.md` symlinks — remediations landed in this review.

No Phase 5 creep (no OAuth, public hosting, remote clone, or MCP write-install tools).

---

## Challenges to Agent 1 proposal / lead report

| Claim / assumption | Challenge | Outcome |
|---|---|---|
| Approach A vs extend `import-skill --target` | Conflating catalog write with client install would blur the Phase 1 gate. | **Accepted** — keep separate CLIs. |
| Import gate required for client install | Gate was catalog-import oriented; sync must not become a laundering path for `pending_audit`. | **Accepted and verified** — unauthorized `sourceId` → `refuse_gate` (unit + CLI smoke). |
| Non-portable entry types → integrations only | Correct for external tooling class. | **Accepted** — `PORTABLE_ENTRY_TYPES` filter; residual: no dedicated `refuse_entry_type` test (Medium). |
| Rollback = latest snapshot, not Git | Fine for local MVP. Lead implied user-owned never overwritten on rollback. | **Challenged → High bug** — after remove + user recreate same id, rollback overwrote user content. **Remediated.** |
| Dep probes = safe `command -v` only | Shell via `sh -c` needs quoting. | **Accepted** — `JSON.stringify(command)`; no skill-script exec. |
| Legacy bash wraps CLI | `"$@"` forwarded to every install; fallback `cp -R` still no preview. | **Accepted** with Low residual — prefer documented `npm run just-do-it`. |
| Snapshots = `SKILL.md` only | Seed catalog is single-file; multi-file skills would lose assets. | **Accepted** residual (also in lead report). |
| Cursor path `~/.cursor/skills` | May not match every Cursor build. | **Accepted** — env override + known-gaps; human UI still Unverified. |
| Lead “user-owned never overwritten/removed” | True for install/remove; **false for rollback** before fix. | **Remediated** — refuse unmanaged dest; refuse symlink `SKILL.md`. |
| Phase 5 creep | OAuth / hosting / remote fetch | **None observed.** |

Answers to lead-report focus (§9):

1. **Import gate cannot be bypassed** via sync CLI for blocked sources — verified.  
2. **Overwrite / symlink / path escape** — install path OK; rollback gaps fixed here.  
3. **external tooling never presented as installed skills** — verified.  
4. **No Phase 5 creep.**  
5. **typecheck / test / build re-run** — all exit 0 (see evidence).

---

## Verification evidence (Agent 2 ran)

| Command / probe | Result |
|---|---|
| `npm run typecheck` | Exit **0** |
| `npm test` | Exit **0** — **11** files, **75** tests (was 72; +3 Agent 2 regressions) |
| `npm run build` | Exit **0** |
| Preview install (temp HOME) | `ok: true`, `action: create`, `preview: true`, no file written until apply |
| Apply install `java-spring-boot` | `applied: true`; `SKILL.md` present under temp `.claude/skills` |
| Gate refuse CLI | `unauthorized-source` / `pending_audit` → reasons include license + importStatus; no install |
| `deps <id>` | `installedCapability: false`; guidance + warnings; probe ≠ capability claim |
| Rollback after remove (empty slot) | Restores snapshot — **PASS** |
| Rollback after remove + user-owned recreate | `refuse_user_owned`; user file intact — **PASS** (post-fix) |
| Rollback with `SKILL.md` symlink | `refuse_path`; outside target unchanged — **PASS** (post-fix) |
| Phase 5 surfaces | No OAuth / public hosting / remote skill fetch / MCP install tools |

---

## Findings

### Critical

_(none)_

### High

1. **~~`applyRollback` overwrote user-owned skills~~ — REMEDIATED by Agent 2**  
   - **Was:** After managed `remove` (snapshot kept, state cleared), a user could recreate the same skill id unmanaged; `rollback` wrote snapshot over that file and re-marked it managed. Lead report claimed user-owned preservation; install/remove honored it, rollback did not.  
   - **Fix:** If destination `SKILL.md` exists and skill is not managed → `refuse_user_owned`. Empty slot after remove may still restore.  
   - **Files:** `src/sync/install.ts`, `tests/sync.test.ts` (regressions: empty-slot restore; user-owned refuse).

2. **~~`applyRollback` could write through a `SKILL.md` symlink~~ — REMEDIATED by Agent 2**  
   - **Was:** Install checked `assertNotSymlink` before write; rollback did not — `writeFile` would follow a symlink and mutate an outside path.  
   - **Fix:** `assertNotSymlink(targetFile)` before preview/apply; refuse with `refuse_path`.  
   - **Files:** `src/sync/install.ts`, `tests/sync.test.ts`.

### Medium

1. **Identical unmanaged content → silent “managed” claim on install**  
   - `noop_identical` with `applyInstall` (non-preview) writes state and adopts the file as managed, enabling later overwrite/remove. Explicit `install` is a weak consent signal.  
   - **Consider:** require `--adopt` / refuse until force flag; or document clearly in CLI help.

2. **`validationStatus: rejected` not blocked on install**  
   - Catalog recommend filters `rejected`; sync only checks import gate + portable entry type. A rejected-but-gated skill on disk can still install.  
   - **Consider:** refuse `rejected` (and maybe `unvalidated` under a strict mode) in `planInstall`.

3. **No unit test for `refuse_entry_type`**  
   - Logic exists for non-portable types; coverage gap vs proposal self-check list.

4. **SKILL.md-only sync vs legacy `cp -R`**  
   - Multi-file skill packages would drop assets; acceptable for current seeds, residual for later.

### Low

1. Legacy `sync-claude-skills.sh` falls back to `cp -R` without preview when npm unavailable.  
2. Snapshot/state path helpers do not re-validate `skillId` (callers do via adapter) — defense-in-depth optional.  
3. Cursor default path remains convention-only (documented).  
4. Lead report test counts outdated after Agent 2 regressions (13 → 16 sync cases; 72 → 75 total).

### Nits

1. Proposal mentioned `src/sync/preview.ts`; preview lives in `install.ts` — fine, delete the dead plan bullet mentally.  
2. `update` and `install` share `applyInstall` — clear enough; optional alias docs.

---

## Exit gate checklist

| Criterion | Status | Evidence |
|---|---|---|
| Installation works on clean test env | **Met** | Temp HOME unit + CLI smoke |
| Update works | **Met** | Managed update + snapshot id |
| Rollback works | **Met** | Content restore; user-owned/symlink cases fixed |
| External deps distinguished | **Met** | integrations/deps flags + tests |
| Client adapters | **Met** | claude-code + cursor |
| Preview before apply | **Met** | `--preview` / `preview <cmd>`; no write |
| Path safety | **Met** | Containment + id regex + tests |
| Preserve user files | **Met** | install/remove + **fixed** rollback |
| Import/authorization gate | **Met** | `evaluateImportGate` on install |
| No skill script execution | **Met** | Design + code audit |
| No Phase 5 creep | **Met** | Scope check |

---

## What's done well

- Clear separation of catalog import vs client sync (Approach A).  
- Reuse of Phase 1 gate and `readSkillFile` / `SKILL_NAME` path rules.  
- Structured preview plans with digests; pin / unpin / managed state model.  
- Integrations registry hard-codes `installedCapability: false` and honest external tooling warnings.  
- Temp-dir focused tests for the exit gate (not only mocks).

---

## Verdict

**PASS** — Phase 4 exit gate met after Agent 2 High remediations (rollback user-owned overwrite + symlink write-through). Coordinator may write `tasks/phase-4-completion.md`. **Do not start Phase 5** until that gate is recorded.

**Residual for later (non-blocking):** adopt flag for identical unmanaged files; refuse `validationStatus: rejected` on install; multi-file skill snapshots; human Claude/Cursor UI acceptance.
