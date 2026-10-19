# Phase 0 gap-closure proposal

Date: 2026-10-19  
Author: Agent 1 (Implementation Lead)

## Problem understanding

Phase 0 exit gate needs:

1. Clean checkout installs and builds reproducibly
2. Known security/compatibility gaps documented
3. No source imported without recorded license/redistribution decision

Prior work delivered schema, source manifest, LICENSE, SECURITY.md, tests, and provenance on catalog tools. Independent audit finds **documentation gaps** against Phase 0 scope (contribution guidance; supported clients + test procedures) and a small **provenance completeness** gap (local starter skills claim `sourceId: just-do-it-local` but that id is absent from `catalog/sources.manifest.json`).

## Gaps vs exit criteria

| Requirement | Status | Evidence |
|---|---|---|
| Inspect TS starter / MCP HTTP | Met | `src/app.ts`, `src/mcp/server.ts` (Streamable HTTP + JSON mode) |
| Clean install/build/typecheck/test | Likely met; must re-verify | `package-lock.json` present; scripts in `package.json` |
| Catalog schema + source manifest | Met | `src/catalog/schema.ts`, `catalog/sources.manifest.json` |
| Known gaps documented | Met | `docs/known-gaps.md` |
| LICENSE + security reporting | Met | `LICENSE`, `SECURITY.md` |
| Contribution guidance | **Missing** | No `CONTRIBUTING.md` |
| Supported client versions + test procedures | **Missing** | README has connect snippets only; no version matrix or procedure |
| Local source recorded in manifest | **Partial** | Code uses `just-do-it-local`; not in manifest |
| Third-party content imported | OK (none) | Manifest statuses ≠ `imported`; local skills original |
| Final license governance | Provisional | MIT in LICENSE; plan notes open §19 decision — not blocking Phase 0 if documented |

## Approaches considered

### A — Docs-only closure (preferred)

Add `CONTRIBUTING.md`, `docs/client-compatibility.md` (supported clients, versions-as-tested, manual test procedure), add `just-do-it-local` to source manifest, tighten `docs/known-gaps.md` + README checklist (lockfile already committed). Re-run typecheck/test/build.

- Pros: Minimal, matches Phase 0 scope, no Phase 1 creep
- Cons: Does not actually run Claude Code / Cursor E2E (still documented as unverified)

### B — Deep license fetch for all inventory URLs

Network-fetch LICENSE from each upstream repo and fill `license` fields.

- Pros: Stronger audit trail
- Cons: Out of Phase 0 “no import without decision”; still `pending_audit` until human signs off; network-dependent; risk of stale claims

### C — Wait for human on MIT vs other license before any docs

- Pros: Avoids provisional license
- Cons: Blocks Phase 0 unnecessarily; plan already chose provisional MIT

## Preferred approach + rationale

**Approach A.** Closest match to exit gate with smallest change. License fetch (B) is Phase 1 prep / human audit work; provisional MIT stays documented (not BLOCKED unless human rejects it).

## Out of scope (will not implement)

- Import CLI, duplicate detection pipeline, `recommend_skills`, memory, OAuth
- Claiming Claude Code / Cursor as verified without manual run
- Changing MCP tools beyond existing Phase 0 surface

## Implementation plan (if approved by process — Wait unavailable, proceed A)

1. Write `tasks/phase-0-proposal.md` (this file)
2. Add `CONTRIBUTING.md`
3. Add `docs/client-compatibility.md` + README link
4. Add `just-do-it-local` entry to `catalog/sources.manifest.json` (`importStatus: imported`, license MIT)
5. Touch `docs/known-gaps.md` / README checklist for lockfile + client procedure pointer
6. Update `tasks/todo.md` for remaining Phase 0 items
7. Run `npm run typecheck`, `npm test`, `npm run build`; record output
