# Phase 2 Lead Report — Context-aware skill recommendation

**Role:** Agent 1 (Implementation Lead)  
**Date:** 2026-10-19  
**Repo:** `/Users/mohammedfaiz/Desktop/build-my-product-mcp`  
**Roadmap:** `docs/implementation.md` §6 Phase 2 + §8 `recommend_skills` + §10  
**Proposal:** `tasks/phase-2-proposal.md`  
**Status:** Implementation complete for Agent 2 review — **does not claim PASS**

---

## 1. Phase and objective

**Phase:** Phase 2 — Context-aware skill recommendation  

**Objective:** Recommend relevant skills for the user's current task.

**Exit gate (mandatory — for coordinator after review):**

1. Recommendations improve over a keyword-only baseline on the evaluation set  
2. Each recommendation has a defensible explanation  
3. Unsupported skills and dependencies are not fabricated  

---

## 2. Understanding and approach

### Chosen design: Approach A — tokenized weighted metadata ranker

Pipeline (inspectable, no embeddings / no opaque model score):

1. **Filter** — only import-gate-allowed summaries from `SkillCatalog` index; skip `validationStatus=rejected`  
2. **Retrieve** — tokenize task (+ optional free-text `projectContext`); expand via small synonym map  
3. **Score** — weighted id/name, tags, category, description overlap, validated boost  
4. **Rerank** — sort by score, bound to `limit` (max 10)  
5. **Abstain** — `needs_clarification` for empty/vague tasks; `insufficient_evidence` below min score  
6. **Explain** — human explanation + `evidence[]` with `kind: verified | inferred`  

**Rejected:**

| Approach | Why not |
|---|---|
| B — wrap substring `search_skills` | Whole-query substring fails NL tasks; weak explanations |
| C — embeddings / hybrid semantic | Roadmap: establish metadata baseline first; new deps |

**Assumptions (as in proposal):**

- `projectContext` = free-text ranking hint, not Phase 3 memory  
- Keyword-only baseline = equal-weight token presence (`keyword_token_equal`)  
- Synonym map is seed-catalog-sized and eval-tied  

---

## 3. Deliverables

| Deliverable | Status | Location |
|---|---|---|
| Proposal before coding | Done | `tasks/phase-2-proposal.md` |
| Ranking core | Done | `src/skills/recommend.ts` |
| Catalog API | Done | `SkillCatalog.recommend()` |
| MCP tool `recommend_skills` | Done | `src/mcp/server.ts` |
| Capabilities list updated | Done | `just_do_it_version` includes `recommend_skills` |
| Unit tests | Done | `tests/recommend.test.ts` (+ app tools list) |
| Eval dataset | Done | `eval/recommend-eval.json` (13 cases) |
| Eval harness | Done | `npm run eval:recommend` → `src/cli/eval-recommend.ts` |
| Recorded metrics | Done | `eval/recommend-eval-results.json` |
| Docs / todo / gaps | Done | README, `docs/known-gaps.md`, `tasks/todo.md` |

**Not implemented (correctly out of scope):** project memory, OAuth, Postgres, CLI sync/rollback, embeddings.

---

## 4. How improvement over baseline is measured

**Baseline (`keyword_token_equal`):** tokenize task+context; score = count of tokens present in skill haystack; no synonyms; no field weights; `minScore=1`.

**Recommend (`metadata_weighted_v1`):** synonyms + field weights + validated boost + vague-task clarification + higher `minScore` (default 8).

**Metrics on the same 13-case set:**

| Metric | Definition |
|---|---|
| Hit@3 | Expected skill id appears in top-3 when `expectedSkillIds` non-empty |
| Precision@3 | Mean of `|top ∩ expected| / |top|` over cases that emit recommendations |
| Abstain accuracy | For cases expecting `insufficient_evidence` or `needs_clarification`, status/empty-list behavior matches intent |
| Fabrication | Recommended id not in authorized catalog (must be **0**) |

**Self-check gate:** improve Hit@3, **or** hold Hit@3 while improving Precision@3 or abstain accuracy; fabricationCount = 0.

### Recorded numbers (2026-10-19)

| | Baseline | Recommend |
|---|---|---|
| Hit@3 | **1.000** (10/10) | **1.000** (10/10) |
| Precision@3 | **0.758** | **0.950** |
| Abstain accuracy | **0.667** (2/3) | **1.000** (3/3) |
| Fabrication | 0 | 0 |

`exitGate.passSelfCheck`: **true** (`precisionAt3Improved` + `abstainImproved`; Hit@3 tied).

Playwright / weather abstain correctly under recommend; baseline still falsely recommended `regression-testing` for Playwright before synonym tightening (now both abstain after removing generic `test`→regression expansion — recommend abstainAcc 3/3).

---

## 5. Import gate and non-fabrication guarantees

- Candidates come only from `buildSummaryIndex()`, which already skips unauthorized `sourceId`s via `evaluateImportGate`.  
- Test: pending_audit skill on disk is **not** recommended (`tests/recommend.test.ts`).  
- Unsupported requests (e.g. Playwright) return empty recommendations — no invented skill ids.  
- Availability claim is always `available_in_catalog` — never “installed”.  
- Prerequisites for `instruction_skill` are `not_applicable` / honest `unknown` for CLI/plugin/MCP entry types.

---

## 6. Validation evidence

| Command | Result |
|---|---|
| `npm run typecheck` | Exit **0** |
| `npm test` | Exit **0** — **9** files, **49** tests |
| `npm run build` | Exit **0** |
| `npm run eval:recommend` | Exit **0** — `passSelfCheck: true` |

---

## 7. Files changed / added

**Added**

- `tasks/phase-2-proposal.md`
- `tasks/phase-2-lead-report.md` (this file)
- `src/skills/recommend.ts`
- `src/cli/eval-recommend.ts`
- `tests/recommend.test.ts`
- `eval/recommend-eval.json`
- `eval/recommend-eval-results.json`

**Modified**

- `src/skills/catalog.ts` — `recommend()`, capabilities  
- `src/mcp/server.ts` — register `recommend_skills`  
- `tests/app.test.ts` — tools list  
- `package.json` — `eval:recommend` script  
- `README.md`, `docs/known-gaps.md`, `tasks/todo.md`

---

## 8. Known limitations (honest)

- Hit@3 tied at 1.0 on this small seed catalog; improvement shown on Precision@3 and abstain, not Hit@3 delta.  
- Synonym map is hand-maintained for five local skills; will need retuning as catalog grows.  
- No semantic / embedding retrieval (deferred).  
- `projectContext` is not durable memory (Phase 3).  
- Ambiguous near-ties may return `needs_clarification` with up to two candidates.  
- No interactive Claude Code / Cursor E2E for recommend (unit + eval harness evidence only).

---

## 9. Challenges for Agent 2 (Independent Reviewer)

1. Is Precision@3 + abstain improvement (Hit@3 tied) sufficient for “improve over keyword-only baseline,” or must Hit@3 strictly increase?  
2. Is free-text `projectContext` an acceptable Phase 2 stand-in for “optional project context reference”?  
3. Does the synonym map count as inspectable ranking, or as hidden coupling that should live only in eval fixtures?  
4. Any path that could recommend `pending_audit` / unauthorized content as available?  
5. Any fabricated prerequisite or “installed” claim?  
6. Scope creep into Phase 3+?

---

## 10. Final status (Agent 1)

**Ready for independent review. Does not claim PASS.**

Coordinator should set Phase 2 gate only after Agent 2 review and any remediations.
