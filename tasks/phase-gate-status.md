# Phase gate status — honest rollup (lead remediation)

**Date:** 2026-10-19  
**Purpose:** Respond to review finding that Phase 7 appears complete while Phase 6 human gates remain open.  
**Rule:** Do not retroactively mark a phase complete to match the code.

## Summary

| Phase | Engineering artifacts | Exit gate (roadmap) | Status |
|---|---|---|---|
| 0 Baseline | Present | Clean install + documented gaps + no unapproved import | **PASS** (eng) — see `phase-0-completion.md` |
| 1 Registry MVP | Present | Search/get + tests | **PASS** (eng) |
| 2 Recommend | Present | Eval improves over baseline | **PASS** (eng) — metrics in `eval/recommend-eval-results.json` + `docs/recommend-eval.md` |
| 3 Memory | Present | Isolation + retrieve + delete | **PASS** (eng) — SQLite per ADR-003 (roadmap Postgres sentence superseded) |
| 4 Sync CLI | Present | Install/update/rollback | **PASS** (eng) |
| 5 Auth / private | Present | Bearer + owner binding; public refused | **PASS** (private/local) — public/OIDC **BLOCKED** |
| 6 OSS release / adoption | Docs + CI present | External install without founder help; support process; feedback triage | **PARTIAL** — eng hygiene **PASS**; human publish / live Actions on remote / client UI / outreach **NOT PASSED** |
| 7 Team foundation | Code present | Multi-member private config | **OUT OF SEQUENCE** — engineering started before Phase 6 human gates closed |

## Phase 6 — what is still open (do not claim full PASS)

Outstanding human / release actions (also in `docs/release-checklist.md`, `docs/known-gaps.md`, `docs/release-readiness.md`):

1. First git commit(s) on `main` — **done** (public repo: https://github.com/faizxmohammad/jdi)  
2. Public repository URL — **done** (`catalog/sources.manifest.json` + README clone URL)  
3. First tag / GitHub Release (`v0.1.0`) — still open  
4. Actions green on the published remote — **done** (Node 24 / FTS5)  
5. Claude Code / Cursor clean-machine UI verification (**Unverified**)  
6. Docker UID / persistence / restore — **partially evidenced** on this host (`docs/release-readiness.md`); keep operator `chown` as normal path  
7. **Accepted CI gap:** lint/format + container image scan not in CI (explicit)  
8. External tester outreach (process docs only)  
9. Claude Code / Cursor clean-machine UI still **UNVERIFIED** (human)  

**Correct claim:** Phase 6 Approach A (minimal OSS hygiene **in-repo**) is done. Phase 6 **adoption exit gate** is **not** fully passed.

## Phase 7 — out-of-sequence acknowledgment

Team org/scopes/catalog-path work landed while Phase 6 human gates were still open.

**Why it happened (process failure, not a feature claim):** parallel agent coordination treated “private team foundation” as engineering prep and did not re-check Phase 6 human residuals before starting Phase 7.

**Corrective action:**

1. Mark Phase 7 as **engineering preview / out of sequence**, not a closed product gate.  
2. Return focus to Phase 6 residuals above before expanding team features further.  
3. Authorization semantics remediations from lead review (role ceilings) are applied in code; further team scope is frozen until Phase 6 human gates progress.

Updated Phase 7 docs: `tasks/phase-7-completion.md` (status revised).

## Evidence pointers (do not invent)

| Claim | Evidence |
|---|---|
| Automated suite | `npm test` (see CI workflow) |
| Recommend eval | `npm run eval:recommend` → `eval/recommend-eval-results.json` |
| Public mode refused | `src/app.ts` + `docs/deployment-modes.md` |
| Source policy | `docs/source-policy.md` + `catalog/sources.manifest.json` |
| Memory store choice | `docs/decisions/ADR-003-sqlite-memory.md` |
