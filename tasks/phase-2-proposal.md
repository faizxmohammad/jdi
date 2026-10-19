# Phase 2 proposal — Context-aware skill recommendation

Date: 2026-10-19  
Author: Agent 1 (Implementation Lead)  
Roadmap: `docs/implementation.md` §6 Phase 2 + §8 `recommend_skills` + §10

## Problem understanding

Phase 2 exit gate needs:

1. Recommendations improve over a keyword-only baseline on an evaluation set
2. Each recommendation has a defensible explanation
3. Unsupported skills and dependencies are not fabricated

Phase 1 already has authorized catalog search/get, import gate, provenance, and summaries-only MCP payloads. Gaps vs Phase 2:

| Requirement | Status | Gap |
|---|---|---|
| `recommend_skills` MCP tool | Missing | Not registered; capabilities omit it |
| Task + optional project context input | Missing | No recommend API |
| Metadata/keyword retrieval (inspectable) | Partial | `search` uses whole-query substring; weak on natural-language tasks |
| Compatibility + availability filters | Partial | Import gate on index; no recommend-time availability/prereq labeling |
| Ranked bounded short list + explanations | Missing | Search returns unranked filter hits |
| Abstain / ask clarification | Missing | Search returns empty array with no status |
| Evaluation set + baseline comparison | Missing | No eval harness |

**Hard constraints:** Respect Phase 1 import gate — never recommend unauthorized / `pending_audit` content as available. Do not invent skills outside catalog. Distinguish verified facts vs inferred relevance. MCP stays read-only. No Phase 3+ (memory store, OAuth, Postgres, CLI sync).

## Assumptions

1. Optional `projectContext` for Phase 2 = free-text hint folded into ranking tokens — **not** persistent project memory.
2. “Keyword-only baseline” = token presence in skill haystack with equal weights, no synonyms/tag boosts/abstain threshold. Recommend adds field weights, small synonym map, validated boost, min-score abstain, clarification.
3. Skip embeddings / opaque model scoring for Phase 2 MVP (roadmap: optional semantic after baseline).
4. Seed catalog (5 local skills) is enough for a representative eval set; unsupported-task cases prove non-fabrication.
5. Prerequisites for `instruction_skill` entries = `not_applicable` / unknown unless source `knownLimitations` or entryType implies local install — never claim CLI/MCP installed.

→ Correct me now or proceed with these.

## Approaches considered

### A — Tokenized weighted metadata ranker + eval harness (preferred)

Add `src/skills/recommend.ts` (pure scoring) + `SkillCatalog.recommend()` + MCP tool + `eval/recommend-eval.json` + `npm run eval:recommend`.

Pipeline:

1. Filter by authorization (reuse summary index / import gate) and skip `rejected`
2. Tokenize task (+ optional projectContext); expand via small inspectable synonym map
3. Score: id/name exact, tag exact, category, description overlap, validated boost
4. Rerank top candidates; cut to limit
5. Below min score → `insufficient_evidence`; too vague → `needs_clarification`
6. Each hit: explanation + evidence (`verified` vs `inferred`) + provenance/version + prerequisites

- Pros: Meets exit gate; inspectable factors; beats naive keyword baseline; no new deps
- Cons: Synonym map is hand-tuned to seed catalog (document as eval-tied, not general NLP)

### B — Reuse `search_skills` as recommend

Wrap current substring search and add canned reasons.

- Pros: Tiny
- Cons: Whole-query substring fails most NL tasks; cannot beat a token baseline honestly; weak explanations

### C — Embeddings / hybrid semantic search

- Pros: Better recall at scale
- Cons: New deps, opaque-ish scores, Phase 2 says establish metadata baseline first

## Preferred approach + rationale

**Approach A.** Smallest design that (1) improves Hit@k / Precision@k over an equal-weight token baseline on a checked-in eval set, (2) always explains with factor-level evidence, (3) abstains rather than fabricating skills.

## Out of scope (will not implement)

- Phase 3 memory tools / Postgres / OAuth
- CLI sync / install / rollback
- Embedding or LLM-as-judge ranking
- Importing third-party / `pending_audit` skills
- Claiming Claude Code / Cursor E2E for recommend (unit + eval harness evidence)

## Implementation plan

1. Write this proposal
2. Types + `recommendSkills()` pure function (filter → score → rerank → abstain)
3. Wire `SkillCatalog.recommend` + MCP `recommend_skills`; update `just_do_it_version` capabilities
4. Unit tests: ranking, explanations, gate, abstain, no fabrication
5. Eval dataset + harness; record baseline vs recommend metrics
6. Docs/todo/known-gaps touch; typecheck/test/build
7. Lead report (no PASS claim)

## Success evidence (self-check before Agent 2)

- `recommend_skills` listed in tools + capabilities
- Eval: recommend Hit@3 and Precision@3 **strictly greater** than keyword-only baseline on same set
- Every recommendation includes explanation + at least one evidence item + version/provenance
- Unauthorized / unknown skill ids never appear
- Vague / out-of-catalog tasks return `insufficient_evidence` or `needs_clarification`, not invented skills
- `npm run typecheck`, `npm test`, `npm run build` exit 0
