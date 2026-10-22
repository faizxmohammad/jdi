# Skill execution report

**Date:** 2026-10-22  
**Command:** `npm run eval:skills`  
**Result file:** `eval/skill-execution-results.json`

## What exists now

Just Do It still does not execute a skill by itself. The MCP server returns skill text and calls allowlisted tools. The new harness in `src/eval/harness/` is the missing loop: scenario, real catalog, tool dispatch, transcript, grader, cleanup.

Invocation is documented in `docs/eval-harness.md`.

## Batch that actually ran

| Class | Count | Meaning |
|---|---|---|
| Deterministic harness tests | 12 tests in `tests/harness.test.ts` | Provider missing, malformed output, timeout, blocked shell, path escape, secret redaction, fabricated status, two acceptable diagnoses, prompt leak, tool error, mock live HTTP, full simulated batch twice. |
| Simulated scenarios | 13 pass, 0 fail | Scripted turns. Real `recommend_skills` and `get_skill`. |
| Live model | 13 blocked | `npm run eval:skills -- --live` without `JUST_DO_IT_EVAL_API_KEY`, `JUST_DO_IT_EVAL_BASE_URL`, and `JUST_DO_IT_EVAL_MODEL`. Exit code 1. |
| Live Context7 / Playwright / database | 0 | Not configured. The library-docs scenario checks the proxy-off payload only. |

Full unit suite after the harness: 131 tests, 18 files, all passing. That number includes the harness tests. It is not an operational-validation count.

Token usage for the simulated batch is `unavailable`. `estimatedCostUsd` is null. No price table was invented.

## Per-skill execution matrix

`operationallyValidated` is false for every skill. A simulated pass means the script loaded the skill through the catalog and the final text cited strings the tools returned.

| Skill | Scenario | Simulated | Live model | Outcome validated |
|---|---|---|---|---|
| hotel-booking-debugger | `hbd-partial-cancel` | pass | blocked | no |
| regression-testing | `regression-flaky` | pass | blocked | no |
| database-migrations | `db-expand` | pass | blocked | no |
| defensive-review | `defensive-webhook` | pass | blocked | no |
| current-library-docs | `library-docs-disabled` | pass | blocked | no |
| java-spring-boot | `java-endpoint` | pass | blocked | no |
| nodejs-architecture | `node-circular` | pass | blocked | no |
| repo-orientation | `repo-trace` | pass | blocked | no |
| interface-review | `interface-signup` | pass | blocked | no |
| browser-verification | `browser-missing` | pass | blocked | no |
| smallest-change | `smallest-format` | pass | blocked | no |
| session-skill-review | `session-existing` | pass | blocked | no |
| find-catalog-skill | `find-ponytail` | pass | blocked | no |

The partial-cancellation grader accepts any final answer that cites `bk-100`, `rm-9`, `trace-hbd-1`, `confirmed`, and `cancelled` from `read_fixture`, and that includes a regression-test mention. It does not require one root-cause sentence. A unit test passes two different readings of the same rows and fails `status: "paid"` because that value is not in the evidence.

## Validation dimensions

| Dimension | State after this milestone |
|---|---|
| 1 Structural | Still confirmed by parse and `npm test`. |
| 2 Discovery | Unchanged this milestone. The hand-written recommend fixture is still not an adversarial holdout. |
| 3 Planning | Still confirmed for the catalog planner tests. The harness also calls `recommend_skills` and `get_skill` for real. |
| 4 Instruction quality | Still human review only. |
| 5 Operational execution | Not confirmed. No live model followed a skill. |
| 6 Outcome correctness | Not confirmed. Scripts were written to satisfy the grader. |
| 7 Safety behavior | Harness policy is tested: `run_command` is blocked, workspace paths cannot escape, secrets are redacted, cleanup runs after failure. A live model has not been shown to obey the same rules. |

`validationStatus: validated` in skill frontmatter does not mean dimensions 5–7 passed. `docs/skill-authoring-standard.md` says this explicitly.

## Unresolved dependencies

- A live model: set the three `JUST_DO_IT_EVAL_*` variables and rerun with `--live`.
- Context7: a key plus `allowLiveExternal` on a scenario. The default batch forces the proxy off.
- Playwright: still a user-environment CLI. The harness does not spawn it.
- Postgres or another database engine for a real migration apply. `db-expand` only writes a SQL artifact in a temp directory.
- No production booking system, and none should be used for this harness.
- Graphify and Reverse Engineer Anything are not execution targets. `repo-orientation` reads a text fixture.
- Discovery scores on the 39 hand-written recommend cases were not treated as a new accuracy claim in this run.

## Fixes in this milestone

- Added the harness, 13 scenario fixtures, harness tests, `npm run eval:skills`, and the validation wording above.
- Changed the partial-cancellation contract so the graded result is evidence citation, not a single predetermined cause.
- Left skill bodies unchanged.
