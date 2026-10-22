---
name: browser-verification
description: Verify a user-facing flow with Playwright CLI in the user environment; report commands run, results, and what could not run if the CLI is missing.
entryType: cli_integration
category: verification
tags: playwright, browser, end-to-end, automation, e2e
triggers: playwright, browser automation, end-to-end browser, e2e test, run browser test, click through
requires: playwright-cli
provides: browser-check
outputs: Commands run, results per step (pass/fail/blocked), and an explicit statement of what could not be verified and why.
version: 0.2.0
validationStatus: validated
sourceId: just-do-it-local
---

# Browser verification

## Purpose and scope

Use this skill to verify a user-facing flow by running Playwright CLI commands in the user's environment.

Activate it when:
- The task changes a rendered UI flow (form, modal, checkout, navigation, modal focus trap).
- The user asks to confirm that a browser-visible change works end to end.
- A regression test requires browser-level verification.

Do not activate it when:
- The behavior is fully covered by unit or integration tests.
- The change is a backend-only change with no visible output.
- The user has not asked for browser verification.

## Prerequisites

1. **Playwright CLI must be installed in the user environment.** The Just Do It server does not launch a browser. Run `playwright-cli --help` (or `npx playwright --version` if the project uses the npm package). If the command is not found, stop. Report that browser verification requires Playwright in the user environment.
2. **The application must be running.** Know the base URL (localhost port, staging URL). Ask the user if unknown.
3. **Know the flow to verify.** Name the start URL, the user action(s), and the expected final state.

## Workflow

### 1. Check CLI availability

Run:
```
playwright-cli --help
```
Or:
```
npx playwright --version
```

If the command returns an error or is not found:
- Report: "Browser verification is blocked: `playwright-cli` is not available in this environment."
- Name the install command: `npm install -D @playwright/test && npx playwright install`.
- Stop. Do not claim the flow passed.

### 2. Define the verification plan

Before running commands, state:
- Start URL.
- User actions in order (navigate, click, fill, submit).
- Expected state after each critical action (URL change, element visible/hidden, text present).
- One error path to cover (empty required field, failed submission, unauthenticated access).

### 3. Cover the success path

Use CLI commands that return short, parseable results. Prefer:
- `playwright-cli screenshot <url> <output.png>` for visual baseline.
- `playwright-cli codegen <url>` to record a short script from user interaction (user runs this).
- Test runner scripts (`npx playwright test <file>`) when a test file already exists for the flow.

For a quick smoke check without a test file, construct a minimal inline test using the Playwright test API and run it with `npx playwright test --inline` or equivalent.

### 4. Cover one error path

Choose the error path most likely to be affected by the change:
- An empty required field on the success path form.
- Navigation to the changed URL while unauthenticated.
- Submission with an invalid input value.

Run a test that confirms the correct error state is shown.

### 5. Record the outcome

For each step, record:
- Command run (exact, without credentials).
- Result: pass, fail, or blocked (with reason for blocked).
- For failures: the error message or observable state.
- For visual verification: attach the screenshot path in the user environment.

Screenshots stay in the user environment unless the user explicitly asks to include them in context.

## Decision rules

- **Missing CLI → report and stop.** Do not claim the flow passed without running it.
- **Flaky test → fix before reporting pass.** A test that passes on the second run without a documented explanation for the first failure is not a pass.
- **Test against the change, not the whole app.** Focus the verification on what changed and its adjacent flows. Do not run the full suite unless the user asks.
- **CLI commands over full accessibility tree dumps.** Do not dump the full page accessibility tree into the prompt. Use targeted assertions instead.
- **No credential logging.** Do not include passwords, tokens, or session cookies in the recorded commands or output.

## Tool contracts

This skill uses no MCP tools. The `playwright-cli` binary runs in the user environment.

The capability `playwright-cli` in `catalog/external-capabilities.json` provides:
- `kind`: `cli_integration`
- `integration`: `user_environment`
- `installHint`: install command for the user

When `plan_capabilities` returns a `check_user_tool` step for `playwright-cli`, relay that step to the user verbatim before proceeding.

## Verification and acceptance criteria

Browser verification is complete when:
1. The CLI is confirmed available (recorded command and output).
2. The success path is run and passes.
3. One error path is run and produces the correct error state.
4. Each step is recorded with command, result, and any failure message.
5. No untested step is claimed as passing.

## Failure handling

- **CLI missing** → name the install command. Stop. The user must install and re-run.
- **App not running** → ask for the base URL and confirm the server is started. Do not guess a port.
- **Test is flaky** → record the inconsistency. Do not claim a pass. Investigate timing or state issues.
- **Selector is brittle (breaks on text change)** → use `data-testid` or ARIA role selectors. Report if the source code does not expose testable attributes and the change is the right place to add them.

## Deliverables

1. CLI availability check (command + output).
2. Verification plan (start URL, actions, expected states, error path).
3. Step-by-step results table (command, result, notes).
4. Screenshot paths if captured (stays in user environment unless shared).
5. Explicit list of what could not be verified and why.
