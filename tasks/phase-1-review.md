# Phase 1 Independent Review — Just Do It MCP

**Reviewer:** Agent 2 (Independent Reviewer / Challenger)  
**Date:** 2026-10-19  
**Roadmap:** `docs/implementation.md` §6 Phase 1 + §4.1 + §8  
**Proposal reviewed:** `tasks/phase-1-proposal.md` (Approach A)  
**Lead report:** `tasks/phase-1-lead-report.md` (not treated as PASS)  
**Recommended status:** **PASS** (after High findings remediated during this review)

---

## Independent assessment

Phase 1’s **exit gate** is met with evidence after Agent 2 remediations:

1. Clean HTTP MCP client can discover (`search_skills`) and retrieve (`get_skill`) `java-spring-boot` from `./skills`.
2. Results include provenance (`sourceId`, `sourceUrl`, `license`, `commitOrRelease`) and version (`0.1.0`) plus `sha256` on get.
3. Search returns summaries only — no skill `content` field in the agent-facing payload (asserted in tests + live smoke).

Agent 1 Approach A is the right scope call: local import CLI + diagnostics + manifest-backed provenance; third-party network fetch correctly BLOCKED. Do **not** rubber-stamp the lead report: two High licensing/provenance holes existed in the first landing and would have laundered unsigned content as local MIT.

Claude Code / Cursor interactive E2E remains **Unverified**. Interpreted exit gate via Direct HTTP MCP (already the Phase 0 verified client path). Marking interactive clients as residual, not a Phase 1 FAIL.

---

## Challenges to Agent 1 proposal / lead report

| Claim / assumption | Challenge | Outcome |
|---|---|---|
| Missing `sourceId` may default to `just-do-it-local` | **High.** Dropping third-party `SKILL.md` into `skills/` without `sourceId` would pass the gate and get MIT provenance. | **Remediated:** require explicit `sourceId`; seed skills updated; regressions added. |
| Manifest load failure → serve without gate | **High.** `getManifest()` swallowed errors and skipped the gate (`if (manifest)`). | **Remediated:** fail closed; load errors propagate; tests added. |
| `imported` + known license enough for any source | **High.** Mistaken third-party `imported` without pin bypassed `approved_for_import`. | **Remediated:** only `just-do-it-local` may be `imported` without pin. |
| Default provenance `license: "MIT"` when source missing | **Medium→High** with fail-open. Fabricated license. | **Remediated:** provenance requires resolved manifest source; no MIT default. |
| Client E2E may stay Unverified | Softens exit gate wording. Acceptable if Direct HTTP MCP proves discover/retrieve; do not claim Claude/Cursor verified. | **Residual** (documented). |
| In-process summary index vs “search does not load catalog into agent context” | Exit gate is about **agent** context, not server RAM. Summaries-only MCP payload satisfies it. Full bodies still read server-side to build index — fine for MVP. | Accepted. |
| `--check` on local originals = import path | Sufficient for Phase 1 seed; no need for fake `approved_for_import` third-party. | Accepted. |
| `Skill not found` for unauthorized sources | Hides authorization reason; OK for least disclosure, weaker ops UX. | Residual Low. |
| Phase 1 tool name `skills_hub_version` in roadmap vs `just_do_it_version` | Doc drift in `implementation.md` §6 vs §8. | Residual Low (use §8 / existing name). |

No Phase 2+ creep observed (`recommend_skills` / memory / OAuth absent). MCP remains read-only; import is CLI-only. No skill script execution (`child_process` / `spawn` / `eval` absent as APIs).

---

## Verification evidence (Agent 2 ran)

| Command / probe | Result |
|---|---|
| `npm run typecheck` | Exit **0** |
| `npm test` | Exit **0** — **8** files, **40** tests passed (was 35 before Agent 2 remediations) |
| `npm run build` | Exit **0** |
| `node dist/cli/import-skill.js --diagnose --catalog ./skills` | Exit **0**, `ok: true`, `skillCount: 5` |
| `… --source just-do-it-local --from ./skills/java-spring-boot --check` | Exit **0**, provenance + sha256 + version |
| `… --source unauthorized-source … --check` | Exit **1**, `action: "blocked"` |
| Live HTTP MCP smoke (`search_skills` query=`spring`, `get_skill` `java-spring-boot`@`0.1.0`) | Discover 1 summary (no body field); get returns content + provenance + digest |
| Third-party `importStatus: imported` in manifest | **None** — only `just-do-it-local` |
| Skill script execution surface | None in `src/**` beyond regex `.exec` |

---

## Findings

### Critical

_(none)_

### High

1. **~~Silent `sourceId` default launders orphans as local~~ — REMEDIATED by Agent 2**  
   - **Was:** `readSkillFile` defaulted missing `sourceId` → `just-do-it-local`; unauthorized content could look approved.  
   - **Fix:** Require explicit `sourceId`; add `sourceId: just-do-it-local` to five seed skills; catalog/diagnostics reject missing; tests.  
   - **Files:** `src/catalog/skillFiles.ts`, `skills/*/SKILL.md`, `tests/catalog.test.ts`, `tests/diagnostics.test.ts`, `tests/app.test.ts`.

2. **~~Catalog fail-open without manifest~~ — REMEDIATED by Agent 2**  
   - **Was:** Failed manifest load returned `undefined`; search/read skipped gate.  
   - **Fix:** `getManifest()` always loads or throws; gate always applied.  
   - **Files:** `src/skills/catalog.ts`, regression in `tests/catalog.test.ts`.

3. **~~Non-local `imported` without pin~~ — REMEDIATED by Agent 2**  
   - **Was:** Any `imported` + non-unknown license passed, including accidental third-party marks.  
   - **Fix:** Pin required unless `id === "just-do-it-local"`.  
   - **Files:** `src/catalog/importPolicy.ts`, `tests/importPolicy.test.ts`, CLI help text.

### Medium

4. **Claude Code / Cursor still Unverified** — `docs/client-compatibility.md`  
   - Deliverable asks for verified connection instructions; procedures exist; interactive E2E not run.  
   - **Non-blocking for exit gate** given Direct HTTP MCP evidence. Residual until a human marks Verified.

5. **Summary index can go stale** on long-lived server after on-disk import  
   - Import CLI is a separate process (OK). Running MCP won’t see new skills until restart / `invalidateIndex`.  
   - Documented in `docs/known-gaps.md`. Optional watch later.

6. **`assertNoUnauthorizedImports` still not fail-fast at server startup**  
   - Phase 0 residual; diagnostics CLI covers ops path. Optional.

7. **Vitest / CI residuals from Phase 0**  
   - `npm audit` criticals in Vitest toolchain; no CI workflow despite README checklist. Unchanged.

8. **Deliverable “source errors” coverage was thin**  
   - Malformed metadata + unauthorized source covered; missing-manifest fail-closed added by Agent 2. Empty/missing catalog path still soft-returns `[]` (acceptable).

### Low

9. **Unauthorized get returns generic `Skill not found`** — intentional least disclosure; ops may prefer explicit unauthorized code via diagnostics only.

10. **Roadmap name `skills_hub_version` vs implemented `just_do_it_version`** — follow §8.

11. **Placeholder `sourceUrl` `example.invalid`** — known; honest non-resolving URL.

---

## Acceptance checklist with evidence

| Criterion | Result | Evidence |
|---|---|---|
| Clean client can discover + retrieve expected skill | **Met** | Live MCP smoke + `tests/app.test.ts` / `tests/catalog.test.ts` |
| Result includes provenance + version identifier | **Met** | `sourceUrl` / `sourceId` / `license` / `commitOrRelease` / `version` / `sha256` |
| Search does not load entire catalog into agent context | **Met** | Summaries only; test asserts no `content` on search hits; live smoke `SEARCH_BODY_FIELD false` |
| Searchable approved catalog | **Met** | Five local skills; gate hides unauthorized `sourceId`s |
| Connection instructions | **Met (docs)** / **Residual (Claude/Cursor E2E)** | README + `docs/client-compatibility.md`; Direct HTTP Verified |
| Tests: search / retrieval / malformed metadata / source errors | **Met** | catalog, diagnostics, import CLI, policy, missing-manifest, missing-sourceId |
| Duplicate detection + import diagnostics + CLI | **Met** | `--diagnose`; `npm run import-skill`; tests |
| MCP read-only (no skill script execution) | **Met** | No write tools; no execution APIs |
| No catalog import without `approved_for_import` + known license | **Met** | Gate + CLI block of `unauthorized-source`; manifest unchanged for third-party |
| Blocking High/Critical resolved | **Met** | Agent 2 remediations + 40/40 tests |

---

## What's done well

- Clear fail-closed import gate design and JSON diagnostics CLI.
- Separation of MCP (read) vs CLI (write) surfaces.
- Honest lead report (did not self-PASS; listed risks for Agent 2).
- Search summary index + bounded limit (1–50) keeps agent payloads small.
- Runtime hide of unauthorized catalog entries (not just import-time).

---

## Required Agent 1 follow-ups (non-blocking residuals)

1. Human: run Claude Code / Cursor procedures; update Status column.  
2. Optional: fail-fast `assertNoUnauthorizedImports` at server boot.  
3. Optional: invalidate/watch summary index after external catalog writes.  
4. Track Vitest audit + CI checklist honesty from Phase 0.

---

## Final recommendation

**PASS**

Mandatory Phase 1 exit criteria verified with evidence. High findings from independent review were remediated and re-tested. Third-party import remains correctly BLOCKED. Interactive client verification and Phase 0 toolchain/CI items are residual, not gate blockers.
