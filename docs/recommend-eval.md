# Recommend eval results

**Command:** `npm run eval:recommend` (or `node --import tsx src/cli/eval-recommend.ts`)  
**Fixtures:** `eval/recommend-eval.json`  
**Latest machine output:** `eval/recommend-eval-results.json`  

## Suites

| Suite | Purpose |
|---|---|
| `regression` (13 cases) | Original Phase 2 baseline — keep stable |
| `expanded` | Abstain / irrelevant / overlap / vague — growth set |

Total cases in the current file: **29** (original regression set plus expanded workflow cases, including the Playwright case that now expects `browser-verification`).

## Caveat (lead review)

The sample is still small. Precision@3 averages over small denominators — inspect per-case rows in `eval/recommend-eval-results.json` before treating metrics as strong generalization evidence. Use this harness as a **regression signal**, then grow realistic tasks over time.

## Gate (self-check)

Improve over equal-weight keyword baseline on the **same** case list:

- Primary: Hit@3  
- Secondary: Precision@3 and abstain accuracy  
- Hard: `fabricationCount` must be `0` for baseline and recommend  

Pass if Hit@3 improves, **or** Hit@3 holds while Precision@3 or abstain accuracy improves, and no fabrication.

## Fabrication definition

For each recommended id, if it is **not** in the authorized catalog id set, increment `fabricationCount`.  
`0 fabrication` ≠ “always the best skill”; it means **no invented skill ids outside the catalog**.

## Latest recorded metrics

Re-run locally after ranking/catalog changes. See `exitGate` in `eval/recommend-eval-results.json`.
