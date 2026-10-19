# Phase 2 Independent Review — Just Do It MCP

**Reviewer:** Agent 2 (Independent Reviewer / Challenger)  
**Date:** 2026-10-19  
**Roadmap:** `docs/implementation.md` §6 Phase 2 + §8 `recommend_skills` + §10  
**Proposal reviewed:** `tasks/phase-2-proposal.md` (Approach A)  
**Lead report:** `tasks/phase-2-lead-report.md` (not treated as PASS)  
**Recommended status:** **PASS** (after one High remediation during this review)

---

## Independent assessment

Phase 2’s **exit gate** is met with Agent-2-run evidence:

1. **Improve over keyword-only baseline** — Hit@3 tied at **1.000** (ceiling on this set); Precision@3 **0.758 → 0.950**; abstain accuracy **0.667 → 1.000**; fabrication **0**. Real wins include abstaining on Playwright (baseline still falsely hits `regression-testing`) and tightening Precision on `sql-schema` / `java-service`.
2. **Defensible explanations** — every recommendation includes `explanation`, non-empty `evidence[]` (`verified` | `inferred`), version/provenance, and prerequisites; `rankingNotes` expose mode, tokens, minScore.
3. **No fabricated skills/deps** — candidates only from import-gated `buildSummaryIndex()`; availability claim is always `available_in_catalog` (never installed); unsupported tasks return empty lists.

Approach A (inspectable weighted metadata ranker + eval harness) is the right scope call. No Phase 3 creep. Do **not** rubber-stamp the lead report: one High bug ignored `projectContext` on the vague-task gate (remediated here).

---

## Challenges to Agent 1 proposal / lead report

| Claim / assumption | Challenge | Outcome |
|---|---|---|
| Proposal: Hit@3 **strictly greater** than baseline | Self-check later allowed Hit@3 hold + Precision/abstain win. Spec says “improve,” not “Hit@3 only.” | **Accepted** with honesty: Hit@3 is at ceiling; primary deltas are Precision@3 + abstain. Prefer adding a harder Hit@3-diff case later (Medium residual). |
| `projectContext` = free-text hint, not memory | Matches Phase 2; avoids Phase 3. | **Accepted.** |
| Synonym map “eval-tied” / “expand when eval cases demand” | Risk of eval gaming. Map is inspectable code (not opaque model). Domain synonyms (flyway/liquibase) are legitimate; `liquibase-synonym` case is thin. Removing generic `test`→regression was anti-gaming. | **Accepted** with Medium residual (retune when catalog grows; avoid case-only synonyms). |
| Vague-task clarification | **High.** Gate used `taskTokens` only, so short task + rich `projectContext` always `needs_clarification` — contradicts API contract that context folds into ranking. | **Remediated by Agent 2** (use combined query tokens). |
| Baseline abstain scoring softer than recommend | Baseline abstainOk = empty **or** status≠ok; recommend must match expectStatus. Skews abstain delta. | **Medium residual** — does not change pass (playwright alone still shows recommend win). |
| Authorization-boundary in §10 eval set | Covered by unit test, not eval JSON. | **Medium residual** — add a harness case or document unit-test coverage as the boundary check. |
| Missing MCP `tools/call` for `recommend_skills` | Only tools/list asserted in `app.test.ts`. | **Low** — unit + eval cover behavior. |
| Phase 3 creep | Memory tools / Postgres / OAuth / embeddings | **None observed.** |

Answers to lead-report challenges (§9):

1. Precision@3 + abstain with Hit@3 tied **is sufficient** for “improve” on this seed catalog, given documented ceiling.  
2. Free-text `projectContext` **is acceptable** for Phase 2.  
3. Synonym map **is inspectable ranking**, with known seed coupling (not hidden).  
4. **No** pending_audit recommend path found (index gate + unit test).  
5. **No** fabricated install claims.  
6. **No** Phase 3+ scope creep.

---

## Verification evidence (Agent 2 ran)

| Command / probe | Result |
|---|---|
| `npm run typecheck` | Exit **0** |
| `npm test` | Exit **0** — **9** files, **50** tests (was 49 before Agent 2 fix) |
| `npm run build` | Exit **0** |
| `npm run eval:recommend` | Exit **0** — `passSelfCheck: true` |
| Eval numbers (Agent 2 re-run) | Hit@3 1.000→1.000; P@3 0.758→0.950; abstain 0.667→1.000; fabrication 0 |
| Playwright probe | recommend → `insufficient_evidence` []; baseline still can hit `regression-testing` |
| Pending_audit unit test | Does not recommend unauthorized skill |
| Phase 3 surfaces in `src/**` | None (`get_project_context` / Postgres / OAuth / embeddings absent) |

---

## Findings

### Critical

_(none)_

### High

1. **~~Vague-task gate ignored `projectContext`~~ — REMEDIATED by Agent 2**  
   - **Was:** `isVagueTask(taskTokens)` ran before scoring; short task + rich context always clarified away.  
   - **Fix:** Vague gate uses combined task+context tokens (`queryTokens`). Unit test: `"help me"` + Flyway context → `database-migrations`.  
   - **Files:** `src/skills/recommend.ts`, `tests/recommend.test.ts`.

### Medium

1. **Hit@3 ceiling / softened self-check vs proposal wording**  
   - Improvement is real on Precision@3 and abstain, but Hit@3 cannot rise above 1.0 on this set.  
   - **Ask Agent 1 (optional for later):** add ≥1 case where baseline misses Hit@3 and recommend hits, or keep the documented secondary-metric gate explicitly in proposal/completion.

2. **Synonym map seed/eval coupling**  
   - Comment admits eval-driven expansion; `liquibase-synonym` mainly exercises the map.  
   - **Residual:** retune policy in `docs/known-gaps.md` is enough for PASS; do not grow the map case-by-case without offline rationale.

3. **Asymmetric baseline abstain metric in harness**  
   - Softens baseline abstainAcc; prefer identical status rules for both modes when claiming abstain deltas.

4. **§10 authorization-boundary case not in `eval/recommend-eval.json`**  
   - Unit-tested only. Add an eval scenario (fixture catalog) or explicitly cite the unit test in the completion report.

5. **`java` → `spring-boot` synonym**  
   - Any Java task can recommend `java-spring-boot` even without Spring mention (inferred, labeled). Acceptable for tiny seed catalog; watch false confidence as catalog grows.

### Low

1. No HTTP MCP `tools/call` smoke for `recommend_skills` (list-only).  
2. Checked-in `eval/recommend-eval-results.json` will stale unless regenerated in CI (no CI yet — known Phase 1 residual).  
3. Near-tie `needs_clarification` still returns up to two recommendations — fine, but clients must read `status`.

---

## Exit gate checklist

| Criterion | Status | Evidence |
|---|---|---|
| Improve over keyword-only baseline | **Met** | P@3 0.758→0.950; abstain 0.667→1.000; Hit@3 held at 1.0 |
| Defensible explanation each recommendation | **Met** | explanation + evidence + rankingNotes |
| No fabricated skills/deps | **Met** | fabricationCount 0; gate-filtered candidates; no install claims |
| Tool `recommend_skills` (task + optional context) | **Met** | MCP + `SkillCatalog.recommend` |
| Ranking factors inspectable | **Met** | weights, synonyms, evidence factors, rankingNotes |
| Authorization / import gate | **Met** | index gate + pending_audit unit test |
| Eval set + irrelevant / missing-context tests | **Met** | 13 cases + vague/weather/playwright/context-hint; vague+context unit test |
| No Phase 3 creep | **Met** | no memory/OAuth/Postgres/embeddings |

---

## Required Agent 1 changes

_(none remaining after Agent 2 High remediation)_

Optional follow-ups (do not block PASS): Medium items above.

---

## What's done well

- Clean separation: pure `recommendSkills()` + gated catalog wrapper + MCP tool.  
- Explicit `verified` vs `inferred` evidence and honest prerequisite statuses.  
- Eval harness compares the same cases under two ranking modes and fails the process on gate miss.  
- Anti-gaming: dropped generic `test`/`tests` synonyms after Playwright false positives.  
- Lead report correctly does **not** claim PASS and surfaces Hit@3 ceiling honesty.

---

## Final recommendation

**PASS**

Phase 2 may proceed to coordinator completion. Do not start Phase 3 until the coordinator records the Phase 2 gate.
