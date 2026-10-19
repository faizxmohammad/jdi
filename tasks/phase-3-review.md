# Phase 3 Independent Review — Just Do It MCP

**Reviewer:** Agent 2 (Independent Reviewer / Challenger)  
**Date:** 2026-10-19  
**Roadmap:** `docs/implementation.md` §6 Phase 3 + §8 memory tools + §9 memory policy  
**Proposal reviewed:** `tasks/phase-3-proposal.md` (Approach A — SQLite + FTS5)  
**Lead report:** `tasks/phase-3-lead-report.md` (not treated as PASS)  
**Recommended status:** **PASS** (after one High remediation during this review)

---

## Independent assessment

Phase 3’s **exit gate** is met with Agent-2-run evidence:

1. **Later session retrieves decisions** — temp-file SQLite save → close → reopen → `search` + `getRelevant` find the same id (`tests/memory.test.ts`).
2. **Isolation by user and project** — alice/bob and proj-a/proj-b negative cases; cross-owner delete denied; MCP `tools/call` smoke: `owner-b` search of `owner-a` Flyway decision returns `[]`.
3. **Inspect and delete** — `list_project_memory`, `export_project_memory`, `delete_project_memory` wired and unit-tested; deleted id absent from search.
4. **Retrieval + contradiction tested** — FTS/task ranking; prefer/avoid Redis conflict pair; `supersedesId` hides prior from default list. Agent 2 added a regression that unrelated CSS tasks must not return Redis/Flyway decisions (type-boost leak).

Approach A (SQLite + FTS5, explicit capture, authz-before-rank) is the right scope call for solo self-host. Trust model is stated honestly. No Phase 4 creep. Do **not** rubber-stamp the lead report: one High retrieval bug returned decisions with zero task relevance (remediated here).

---

## Challenges to Agent 1 proposal / lead report

| Claim / assumption | Challenge | Outcome |
|---|---|---|
| SQLite vs roadmap PostgreSQL / Gate D | Roadmap §7.2 prefers Postgres for durable multi-user; Phase 3 exit needs durable retrieval + isolation tests, not multi-node writes. SQLite is SQL-shaped and solo-friendly. | **Accepted** for Phase 3. Postgres remains Phase 5 hosting path (documented in known-gaps). |
| Client-asserted `ownerId` under shared bearer | Any token holder can assert any owner — this is **not** cryptographic multi-user isolation. Proposal + README state this. Exit gate still requires data-layer isolation tests (present). | **Accepted** for private solo/self-host. **Residual High** if endpoint is ever shared: Phase 5 per-user credentials required before public/multi-user. |
| Extra tools `list` / `delete` / `export` | §8 lists three “initial” tools; §9.4 requires inspect/correction/export/deletion. | **Accepted** — extras are required for the exit gate, not creep. |
| Heuristic conflict detection | Polarity + shared tokens will miss subtle contradictions and may false-positive near-duplicates. | **Accepted** with Medium residual — “contradiction handling tested” is met by explicit cases + supersede; not a full NLI system. |
| No memory eval harness like Phase 2 | Coverage is unit/integration only. | **Medium residual** — adequate for gate; optional offline retrieval set later. |
| Docker `./data` bind mount | Image runs as non-root `app`; host dir may be unwritable → SQLite open fails at startup. | **High residual documented** — Agent 2 added README `chmod` note + known-gaps; Compose comment. |
| Phase 4 creep | CLI sync / install / rollback / OAuth / embeddings | **None observed.** |

Answers to lead-report challenges (§8):

1. **SQLite is acceptable** for Phase 3 Gate D with Postgres deferred to multi-user hosting.  
2. **Client-asserted `ownerId` is enough** only with the documented shared-token trust model and a private endpoint.  
3. **list/delete/export are required** for §9.4 — keep them.  
4. **Heuristic conflicts are adequate** for “tested,” with known miss/false-positive residual.  
5. **No Phase 4+ creep.**

---

## Verification evidence (Agent 2 ran)

| Command / probe | Result |
|---|---|
| `npm run typecheck` | Exit **0** |
| `npm test` | Exit **0** — **10** files, **59** tests (was 58 before Agent 2 regression) |
| `npm run build` | Exit **0** |
| `npm run eval:recommend` | Exit **0** — `passSelfCheck: true` (Phase 2 regression) |
| Isolation unit | alice≠bob; proj-a≠proj-b; cross-owner delete `deleted=false` |
| Cross-session reopen | save → close → reopen path finds decision |
| MCP smoke | save/get Flyway; foreign owner search `[]`; tools list includes all 6 memory tools |
| Conflict + supersede | prefer/avoid Redis flagged; supersede hides old from default list |
| Explicit-capture note | `get_project_context.note` matches `/does not scrape/i` |
| Authz before rank | `searchFts` / `list` / `getById` / `delete` all `WHERE owner_id AND project_id` |
| Phase 4 surfaces | No install/pin/rollback CLI; no OAuth; no embeddings |

---

## Findings

### Critical

_(none)_

### High

1. **~~`get_project_context` returned unrelated decisions via type boost alone~~ — REMEDIATED by Agent 2**  
   - **Was:** `TYPE_BOOST` / `VERIFICATION_BOOST` always made `score > 0` for decisions, so any non-empty task could return Redis/session decisions when asking about CSS. Fallback `scored.slice(0, 3)` worsened cold-query pollution.  
   - **Fix:** Split `relevance` (FTS / token overlap / exact) from ranking boosts; when `task` non-empty, return only `relevance > 0`. Empty task still returns recent decision/constraint/preference.  
   - **Files:** `src/memory/service.ts`, `tests/memory.test.ts` (regression: CSS task → `[]`; Flyway task → Flyway only).

2. **Shared-token identity (residual — not a code defect)**  
   - Data-layer isolation is correct and tested, but **not** cryptographic user binding. README + known-gaps already warn.  
   - **Do not** expose this endpoint to untrusted multi-user clients until Phase 5. Does not block Phase 3 PASS for private self-host.

3. **Docker `./data` writability (residual — docs remediated)**  
   - Bind mount + non-root `app` can EACCES on Linux.  
   - **Docs fix by Agent 2:** README `mkdir`/`chmod` note; `docs/known-gaps.md`; Compose comment. Operators must still set correct ownership on shared hosts.

### Medium

1. **Heuristic conflict detector** — polarity/shared-token only; misses subtle contradictions; may flag near-duplicates. Acceptable residual; retune when real false positives appear.  
2. **No dedicated memory retrieval eval harness** — unlike Phase 2 recommend eval. Unit/integration cover the gate; optional offline set later.  
3. **`scope: "user"` is a label only** — queries always require `projectId`; no cross-project user preferences. Documented in known-gaps by Agent 2.  
4. **`export_project_memory` hard-caps at 200** with no `truncated` flag — large projects can silently miss rows. Prefer a truncation indicator later.  
5. **`node:sqlite` experimental** — engines already `>=22.14`; ExperimentalWarning in tests. Track API stability before production scale.  
6. **Correction = supersede only** — no in-place content edit; correct per proposal. Clients must pass `supersedesId`.

### Low

1. MCP smoke covers save/get/cross-owner search; list/delete/export are unit-tested only (no HTTP `tools/call` for those three).  
2. `MemoryStore.unsafeGetByIdOnly` exists for probes — not used by MCP; keep out of production call paths.  
3. Default retention = keep forever (`JUST_DO_IT_MEMORY_DEFAULT_RETENTION_DAYS=0`) — intentional; operators should set TTL if needed.  
4. WAL mode not enabled — fine for single-process; enable if multi-process writers appear.

---

## Exit gate checklist

| Criterion | Status | Evidence |
|---|---|---|
| Later session retrieves relevant saved decisions | **Met** | Reopen test + relevance regression |
| Private records isolated by user and project | **Met** | Unit negatives + MCP foreign-owner `[]` |
| Users can inspect and delete memory | **Met** | list / export / delete tools + tests |
| Retrieval quality and contradiction handling tested | **Met** | FTS/relevance tests; conflict + supersede; Agent 2 relevance fix |
| Tools: get / save / search | **Met** | MCP + capabilities |
| Explicit capture only; no false full-conversation claim | **Met** | Tool descriptions + `note` + README |
| Authorization before ranking; conflicts surfaced | **Met** | Scoped SQL before FTS/rank; `conflicts[]` on save/get/search |
| No Phase 4 creep | **Met** | No CLI sync/rollback/OAuth/embeddings |

---

## Required Agent 1 changes

_(none remaining after Agent 2 High remediations)_

Optional follow-ups (do not block PASS): Medium items above — especially export truncation flag and a small retrieval eval set.

---

## What's done well

- Honest trust-model writeup in proposal, README, and lead report (shared token ≠ user identity).  
- Fail-closed `ownerId`+`projectId` on every store query before ranking.  
- Explicit capture limitation surfaced in tool text and `get_project_context.note`.  
- Supersede path rolls back orphan successor if mark fails; no silent merge.  
- Privacy logger never includes content bodies (unit-asserted).  
- list/delete/export added for §9.4 instead of deferring user control.  
- Lead report correctly does **not** claim PASS and lists residuals for review.

---

## Final recommendation

**PASS**

Phase 3 may proceed to coordinator completion. Do **not** start Phase 4 until the coordinator records the Phase 3 gate. Do **not** expose multi-user public hosting on shared-token memory.
