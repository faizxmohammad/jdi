# Phase 3 Lead Report — Persistent user and project memory

**Role:** Agent 1 (Implementation Lead)  
**Date:** 2026-10-19  
**Repo:** `/Users/mohammedfaiz/Desktop/build-my-product-mcp`  
**Roadmap:** `docs/implementation.md` §6 Phase 3 + §8 memory tools + §9 memory policy  
**Proposal:** `tasks/phase-3-proposal.md`  
**Status:** Implementation complete for Agent 2 review — **does not claim PASS**

---

## 1. Phase and objective

**Phase:** Phase 3 — Persistent user and project memory  

**Objective:** Preserve useful context across sessions without collecting everything indiscriminately.

**Exit gate (mandatory — for coordinator after review):**

1. Later session can retrieve relevant saved project decisions  
2. Private records isolated by user and project  
3. Users can inspect and delete memory  
4. Retrieval quality and contradiction handling tested  

---

## 2. Understanding and approach

### Chosen design: Approach A — SQLite + FTS5 (`node:sqlite`)

| Layer | Choice |
|---|---|
| Persistence | SQLite file (`JUST_DO_IT_MEMORY_PATH`, default `./data/memory.sqlite`) |
| Search | FTS5 + task-token overlap ranking; substring fallback |
| Authz | Fail-closed `ownerId` + `projectId` on every query **before** ranking |
| Capture | Explicit MCP save only — no conversation scraping |
| Conflicts | Heuristic polarity + shared topic tokens; `supersedesId` for corrections |
| User control | `list_project_memory`, `delete_project_memory`, `export_project_memory` |
| Logging | Op + owner/project/record id only — never content bodies |

### Storage debate (summary)

| Option | Verdict |
|---|---|
| **SQLite + FTS5** | **Chosen** — meets exit gate; zero new npm deps; solo self-host friendly; SQL-shaped for later Postgres migrate |
| JSONL | Rejected — weak FTS / racey writes / harder isolation proofs |
| PostgreSQL | Deferred — correct for multi-user hosting (Phase 5); premature ops cost for solo MVP |

### Trust model (honest)

Today’s `JUST_DO_IT_TOKEN` is a **shared gateway credential**, not per-user identity. Tool callers pass explicit `ownerId` / `projectId`. The data layer always scopes by those ids, so isolation tests and future credential binding work. **Any token holder can assert any ownerId** until Phase 5. Docs and README state this; do not claim cryptographic multi-user auth yet.

### Assumptions (as in proposal)

1. Client-asserted owner/project ids + server-side filter  
2. Explicit agent submit only  
3. Correction via `supersedesId`, not silent overwrite  
4. Inspect/export/delete via MCP  
5. No embeddings in Phase 3  

---

## 3. Deliverables

| Deliverable | Status | Location |
|---|---|---|
| Proposal before coding | Done | `tasks/phase-3-proposal.md` |
| Types + Zod schema (§9.1–9.2) | Done | `src/memory/types.ts` |
| SQLite store + FTS5 | Done | `src/memory/store.ts` |
| Authz helpers | Done | `src/memory/authorize.ts` |
| Conflict detection | Done | `src/memory/conflicts.ts` |
| Service (save/get/search/list/delete/export/purge) | Done | `src/memory/service.ts` |
| Privacy logging | Done | `src/memory/logging.ts` |
| MCP tools (6 memory + existing) | Done | `src/mcp/server.ts` |
| App / config / Docker volume | Done | `src/app.ts`, `src/config.ts`, `docker-compose.yml` |
| Capabilities list | Done | `SkillCatalog.version()` |
| Unit + isolation + reopen + conflict tests | Done | `tests/memory.test.ts` |
| MCP tools/call smoke (save/get/cross-owner) | Done | `tests/app.test.ts` |
| Docs | Done | README, `docs/known-gaps.md`, `tasks/todo.md`, `.env.example` |

**Initial tools:** `get_project_context`, `save_project_context`, `search_project_memory`  
**User-control extras:** `list_project_memory`, `delete_project_memory`, `export_project_memory`

**Not implemented (correctly out of scope):** Phase 4 CLI sync/rollback; Phase 5 OAuth/public hosting; embeddings; conversation scraping; skill script execution.

---

## 4. Evidence vs exit gate (self-check)

| Gate | Evidence | Self-check |
|---|---|---|
| Later session retrieves decisions | `tests/memory.test.ts` — save, close DB, reopen path, `search` + `getRelevant` find same id | Met in tests |
| Isolation by user and project | Unit: alice/bob + proj-a/proj-b; cross-owner delete denied; MCP smoke: owner-b search returns `[]` for owner-a data | Met in tests |
| Inspect and delete | `list_project_memory`, `export_project_memory`, `delete_project_memory` + unit coverage | Met in tests |
| Retrieval + contradiction tested | FTS/task ranking tests; conflict pair Redis prefer/avoid; supersede hides old from default list | Met in tests |

**Important limitation documented:** Just-do-it does not scrape conversations; `get_project_context` returns an explicit note to that effect.

---

## 5. Validation commands (Agent 1 ran 2026-10-19)

| Command | Result |
|---|---|
| `npm run typecheck` | Exit **0** |
| `npm test` | Exit **0** — **10** files, **58** tests passed |
| `npm run build` | Exit **0** |
| `npm run eval:recommend` | Exit **0** — Phase 2 regression still `passSelfCheck: true` |

---

## 6. Files changed / added

### New

- `tasks/phase-3-proposal.md`
- `tasks/phase-3-lead-report.md` (this file)
- `src/memory/types.ts`
- `src/memory/store.ts`
- `src/memory/authorize.ts`
- `src/memory/conflicts.ts`
- `src/memory/service.ts`
- `src/memory/logging.ts`
- `tests/memory.test.ts`
- `data/.gitkeep`

### Modified

- `src/mcp/server.ts` — memory tools + deps object
- `src/app.ts` — memory DI
- `src/config.ts` — `JUST_DO_IT_MEMORY_*`
- `src/skills/catalog.ts` — capabilities
- `tests/app.test.ts` — tools list + MCP memory smoke
- `docker-compose.yml` — writable `./data` volume + memory env
- `README.md`, `docs/known-gaps.md`, `tasks/todo.md`, `.env.example`, `.gitignore`

---

## 7. Known limitations / residuals for Agent 2

1. Shared-token trust model — isolation is logical, not cryptographic identity  
2. `node:sqlite` is experimental (Node engines already `>=22.14`)  
3. Conflict detection is heuristic; may miss subtle contradictions  
4. Default retention = keep until delete (`JUST_DO_IT_MEMORY_DEFAULT_RETENTION_DAYS=0`)  
5. Docker needs writable `./data` mount (added); catalog skills remain read-only  
6. No dedicated memory eval harness comparable to Phase 2 recommend eval (coverage is unit/integration tests)  
7. Phase 4/5 still deferred  

---

## 8. Challenge items for Agent 2

1. Is SQLite acceptable vs roadmap’s PostgreSQL wording for Gate D?  
2. Is client-asserted `ownerId` with documented trust model enough before Phase 5?  
3. Are list/delete/export required beyond the three “initial” tools (we added them for §9.4)?  
4. Is heuristic conflict detection adequate for “contradiction handling tested”?  
5. Any Phase 4+ creep?

---

## 9. Final status

**Implementation complete for independent review. Does not claim PASS.**

Await Agent 2 review and coordinator gate decision.
