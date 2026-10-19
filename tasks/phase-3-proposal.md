# Phase 3 proposal — Persistent user and project memory

Date: 2026-10-19  
Author: Agent 1 (Implementation Lead)  
Roadmap: `docs/implementation.md` §6 Phase 3 + §8 memory tools + §9 memory policy  
Auth today: single shared `JUST_DO_IT_TOKEN` (`src/security/auth.ts`)

## Problem understanding

Exit gate needs:

1. Later session can retrieve relevant saved project decisions
2. Private records isolated by user and project
3. Users can inspect and delete memory
4. Retrieval quality and contradiction handling tested

Gaps vs Phase 2:

| Requirement | Status | Gap |
|---|---|---|
| User / project ownership model | Missing | No owner/project ids on durable data |
| Explicit context capture | Missing | No write path; agents cannot submit memory |
| Store prefs / constraints / decisions / Qs / summaries / outcomes | Missing | No store |
| Search + relevant retrieval | Missing | No memory search |
| Provenance, timestamps, scope, verification | Missing | — |
| Contradictory / superseded decisions | Missing | — |
| Inspect, correct, export, delete | Missing | — |
| Retention + privacy-conscious logging | Missing | — |
| Isolation tests before multi-user | Missing | — |
| MCP: `get_project_context`, `save_project_context`, `search_project_memory` | Missing | — |

**Hard constraints:** Agent must submit context explicitly — no conversation scraping. MCP must not execute skill content. Do not implement Phase 4+ (CLI sync/rollback, OAuth public hosting).

## Assumptions

1. **Trust model (honest):** Shared bearer token proves operator access to the MCP gateway only. It does **not** bind a cryptographic user identity. Tool args carry explicit `ownerId` + `projectId`. Data layer **always** filters by those ids before ranking. Any token holder can assert any `ownerId` until Phase 5 per-user credentials. Isolation still required so (a) solo self-host multi-project data stays correct, (b) isolation tests lock the authorization boundary for later identity binding.
2. Context capture is **opt-in via tools** only. Docs must say Just-do-it cannot observe all prompts.
3. Correction = new save with `supersedesId` (marks prior record superseded) rather than silent overwrite.
4. Inspect / export / delete exposed as MCP tools (not only future HTTP admin UI).
5. Embeddings deferred; structured metadata + full-text search only.

→ Correct me now or proceed with these.

## Storage debate (ADR-style)

### Options

| Option | Pros | Cons | Meets exit gate? |
|---|---|---|---|
| **A — SQLite + FTS5** via Node 22 `node:sqlite` | Zero new runtime deps; durable file; SQL isolation filters; FTS5 ranking; easy test `:memory:` / temp file; solo-friendly | Experimental Node API (engines already `>=22.14`); not ideal for multi-writer hosted scale | Yes |
| **B — JSONL / JSON files** | Simplest files | Weak FTS; racey writes; isolation easy to get wrong; harder contradiction queries | Risky for search/contradiction quality |
| **C — PostgreSQL** | Roadmap default for durable multi-user; mature FTS | Daemon/Compose dep; premature for solo self-host MVP; ops cost for founder | Yes, but heavier than needed now |

### Decision

**Approach A — SQLite + FTS5** for Phase 3 MVP.

**Rationale:** Exit gate needs durable cross-session retrieval, owner/project isolation tests, FTS, and delete/export — not multi-node write scaling. Postgres remains the intended path when Phase 5 multi-user hosting lands; schema stays SQL-shaped so migration is a dump/load, not a redesign.

**Revisit when:** Concurrent multi-user writes, managed hosting, or backup tooling require Postgres.

## Preferred approach + tool surface

### Core module: `src/memory/`

- `types.ts` — Zod record schema aligned to §9.1–9.2
- `store.ts` — SQLite persistence + FTS5 index
- `authorize.ts` — fail-closed owner/project filter (never rank before authz)
- `conflicts.ts` — surface conflicting active decisions/constraints (no silent merge)
- `service.ts` — save / get-relevant / search / list / delete / export / retention sweep
- Privacy logs: record id + ownerId + projectId + op; **never** content bodies

### Record fields

`id`, `ownerId`, `projectId`, `recordType`, `content`, `source` (provenance), `createdAt`, `updatedAt`, `verificationStatus` (`unverified` | `verified` | `assumption` | `summary`), `supersededBy`, `retentionExpiresAt`, `scope` (`project` default)

### Record types (§9.1)

`preference` | `constraint` | `decision` | `open_question` | `task_summary` | `outcome` | `rejected_approach` | `reminder`

### MCP tools

| Tool | Role |
|---|---|
| `save_project_context` | Explicit capture; optional `supersedesId`, `retentionDays`, `verificationStatus` |
| `get_project_context` | Authorize → FTS/task relevance → return records + conflict indicators + provenance |
| `search_project_memory` | Authorize → FTS query → ranked hits + conflicts |
| `list_project_memory` | Inspect (paginated list for a project) |
| `delete_project_memory` | Hard delete by id (owner+project must match) |
| `export_project_memory` | JSON export of authorized project records |

`list` / `delete` / `export` satisfy §9.4 user control beyond the three “initial” tools.

### Contradiction handling

1. Explicit: `supersedesId` on save → prior `supersededBy = newId`; superseded excluded from default retrieval.
2. Detected: among active `decision` / `constraint` records in same owner+project, flag pairs that share significant technical tokens but contain opposing polarity cues (`not`, `avoid`, `instead of`, `prefer X` vs `prefer Y`, `must` vs `must not`). Return `conflicts[]` on get/search; never auto-merge.

### Retention

- Optional `retentionDays` on save → `retentionExpiresAt`
- Default: no expiry (until user deletes), configurable via `JUST_DO_IT_MEMORY_DEFAULT_RETENTION_DAYS` (0 = none)
- Reads/search skip expired; `purgeExpired` available for maintenance

### Config

- `JUST_DO_IT_MEMORY_PATH` — SQLite file (default `./data/memory.sqlite`); tests use temp paths / `:memory:`

## Out of scope

- Phase 4 CLI sync / install / rollback
- Phase 5 OAuth / per-user tokens / public hosting
- Embeddings / hybrid semantic search
- Automatic conversation scraping
- Executing skill scripts via MCP

## Implementation plan (slices)

1. Write this proposal
2. Types + SQLite store + authz filter + unit tests (isolation first)
3. Search / get-relevant / conflicts / retention
4. Wire MCP tools + app DI; update capabilities
5. Integration tests: cross-session reopen, inspect/delete/export, contradiction
6. Docs (README, known-gaps, todo, short ADR note in proposal)
7. typecheck / test / build; lead report (**no PASS claim**)

## Success evidence (self-check before Agent 2)

- Tools registered; capabilities list includes memory tools
- Save → reopen DB → `get_project_context` / `search_project_memory` returns decision
- Owner A cannot read Owner B; Project X cannot read Project Y (automated)
- `list` / `delete` / `export` work; deleted id absent from search
- Conflicting decisions return `conflicts` indicator; supersede hides old from default get
- Logs in tests do not include memory content bodies
- Docs state explicit-submit limitation and shared-token trust model
- `npm run typecheck`, `npm test`, `npm run build` exit 0
