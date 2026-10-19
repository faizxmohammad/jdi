# Response to consolidated lead / ChatGPT review

**Date:** 2026-10-19  
**Product:** Just Do It MCP `0.1.0`

This document maps each required fix to the remediation taken. No new product features were added beyond authorization hardening required by the review.

## 1. Phase sequence

| Finding | Response |
|---|---|
| Phase 7 described as done while Phase 6 human gates open | **Acknowledged.** Rollup: `tasks/phase-gate-status.md`. Phase 6 = eng hygiene PASS / adoption gate **PARTIAL**. Phase 7 = **OUT OF SEQUENCE** engineering preview (`tasks/phase-7-completion.md` revised). Not retroactively marked complete. |

## 2. Skill-source audit / “17 inventory” rows

| Finding | Response |
|---|---|
| Need audited manifest for all inventory URLs | **Policy decision documented** in `docs/source-policy.md`: early inventories are research candidates, **not** mandatory installs. Shipping manifest remains first-party only (`catalog/sources.manifest.json` → `just-do-it-local`). Re-listing 17 external URLs would contradict ADR-002 and prior product direction. Future external sources require full audit fields **before** import; none are imported now. Roadmap “eight sources” language updated in `docs/implementation.md`. |

## 3. Team roles vs scopes

| Finding | Response |
|---|---|
| Viewer role was label-only; admin scopes still worked | **Fixed in code.** Org role is a hard ceiling (`scopesForRole` / `scopesWithinRole`). Escalation fails at credential load. Org-bound omitted scopes default to role max, not full admin. Docs: `docs/team-model.md`. Tests: `tests/org.test.ts`. |

## 4. PostgreSQL roadmap vs SQLite implementation

| Finding | Response |
|---|---|
| Architecture disagreement | **ADR-003** accepts SQLite+FTS5 for local/private MVP; Postgres deferred to multi-writer triggers. Roadmap memory/tech sections updated. |

## 5. `chmod 777`

| Finding | Response |
|---|---|
| Unsafe default | **Removed** from normal quick-start / README. Document container `app` UID (typically 100), `chown` + `chmod 700`. World-writable called out only as temporary diagnostic. |

## 6. Interface drift

| Finding | Response |
|---|---|
| `skills_hub_version` vs `just_do_it_version` | Canonical contract: `docs/mcp-tool-contract.md`. Roadmap updated to `just_do_it_version`. |

## 7. Additional evidence requests

| Area | Response |
|---|---|
| Recommend eval metrics | `docs/recommend-eval.md` + checked-in `eval/recommend-eval-results.json` |
| Memory FTS / supersede | Covered by existing `tests/memory.test.ts` (isolation, search, supersede, retention) |
| Path consistency | `docs/operations.md` table for Node vs Compose paths |
| Client UI | Remains **Unverified** — not claimed |
| Release checklist | Phase 6 human residuals listed honestly in phase-gate status |

## Recommended next human actions (no more feature work)

1. Finalize public repo URL + tag when ready  
2. Run Claude Code / Cursor clean-machine checklist (`docs/client-compatibility.md`)  
3. Re-run `npm test` and `npm run eval:recommend` on the release machine  
4. Keep Phase 7 feature freeze until Phase 6 human gates progress  
