---
name: regression-testing
description: Write focused regression tests that fail when protected behavior breaks — start from a defect or flaky failure, not from a coverage metric.
entryType: instruction_skill
category: engineering
tags: testing, regression, qa, flaky, coverage
triggers: flaky test, regression test, add test, bug fix test, failing test, test coverage, write a test
provides: regression-test
outputs: A test (or pair of tests) that fails on the current defect and passes after the fix; includes negative-path coverage for the specific risk.
version: 0.2.0
validationStatus: validated
sourceId: just-do-it-local
---

# Regression testing

## Purpose and scope

Use this skill to:
- Add a test for a defect before or after fixing it.
- Convert a flaky failure into a reliable, named test case.
- Close a specific negative-path gap: auth bypass, validation skip, unsafe file handling, injection.

Do not use this skill to:
- Chase an arbitrary coverage percentage.
- Add tests for all existing code without a specific behavioral risk in mind.
- Write integration tests that require a live environment when a focused unit test will do.

## Prerequisites

Before writing any test:
1. **Reproduce the defect or flaky failure.** If you cannot reproduce it, you cannot write a test that fails before the fix and passes after.
2. **Name the invariant.** State the protected behavior in one sentence: "When input X is given, the system produces Y and never does Z."
3. **Identify the test boundary.** Decide whether the test should be a unit test (one function), an integration test (one request), or an end-to-end test. Choose the smallest boundary that covers the risk.
4. **Read the existing test file** for the module under test. Understand the patterns already in use (mocking approach, assertion library, test data factories, fixture files).

If the invariant cannot be stated, ask the user to clarify the expected behavior before writing any test.

## Workflow

### 1. Confirm the failing state

- Run the existing test suite to establish a baseline. Note which tests already fail (they must not be attributed to your new test).
- If the defect has no reproducing test yet, write a minimal failing test first. The test must fail now.
- Run only that test in isolation to confirm it fails for the right reason.

Record: test name, failure message, line that fails, expected vs actual.

### 2. Define the invariant precisely

From the reproducing test, extract the exact invariant:
- What input triggers the defect.
- What output or side effect proves the invariant is broken.
- What the correct output should be.

Example: "When a session token is expired, `authenticate(req)` must return `{error: "token_expired"}` with status 401, not 500."

### 3. Choose the test scope

| Risk type | Preferred scope | Rationale |
|---|---|---|
| A single function's logic | Unit test | Fastest feedback; no environment |
| A request handler | Integration test with mocked dependencies | Exercises routing and middleware |
| A cross-service interaction | Integration test with test double | Avoids live network |
| A browser-visible flow | CLI test (Playwright) | Only when the bug is in rendered output |

Reject a broader scope when a narrower scope covers the same invariant.

### 4. Write the failing test

Structure:
1. **Arrange** — set up the minimal state that triggers the defect (use existing factories/fixtures; do not invent duplicates).
2. **Act** — call the unit under test with the minimal triggering input.
3. **Assert** — make one assertion per test case; assert the exact incorrect behavior that existed before the fix.

Naming: `<unit>: <invariant description>` e.g. `authenticate: returns 401 with token_expired when session has expired`.

Run the test. It must fail now.

### 5. Fix and verify

After the fix is applied:
- Run the new test in isolation. It must pass.
- Run the full test suite. No previously passing test may now fail.

If the fix causes a regression in an unrelated test, fix the cause — do not disable the failing test.

### 6. Add the negative path

For each defect involving auth, validation, file access, or injection, add at least one test for the opposite path:
- If the fix rejects expired tokens: also test that valid tokens still succeed.
- If the fix sanitises a file path: also test that a safe path still works.
- If the fix validates a required field: also test that the happy path still passes.

The negative-path test guards against over-restriction.

## Decision rules

- **Fix the shared cause, not the symptom.** If five inputs trigger the same defect, write one test covering the root, then parameterise if the inputs have meaningfully different paths through the code.
- **Prefer deterministic inputs.** Use fixed values, not random generators, unless the test is specifically targeting randomness.
- **Mocks should verify behaviour, not existence.** Do not assert that a function was called; assert what the output is. Use mocks only to control dependencies, not to substitute the unit under test.
- **Flaky tests signal a real defect.** Before fixing the test, understand why it is flaky: timing, ordering, global state, network dependency. Fix the cause.
- **Do not test the framework.** If you are testing that `express` routes correctly or that `jest` runs `beforeEach`, remove the test.
- **Do not disable a passing test to make CI green.** If an existing test now fails because of the fix, the test is protecting a real invariant. Either fix the code to preserve the invariant or update the test with an explanation of why the invariant changed.

## Tool contracts

This skill uses no MCP tools. Use the project's test runner directly:

| Task | Command pattern |
|---|---|
| Run all tests | Project-specific: `npm test`, `npx vitest run`, `./gradlew test`, `pytest` |
| Run one file | `npx vitest run tests/foo.test.ts`, `pytest tests/test_foo.py::test_bar` |
| Watch mode | `npx vitest`, `pytest -f` |

Read `package.json` or the project README to find the actual command before running.

## Verification and acceptance criteria

A regression test is complete when:
1. It fails against the unfixed code for the stated reason.
2. It passes after the fix.
3. The full test suite passes after the fix.
4. A negative-path test exists (unless the invariant has no meaningful opposite path).
5. The test name makes the invariant self-documenting.

## Failure handling

- **Cannot reproduce the defect** → stop. Ask the user for reproduction steps, environment, and a specific input that triggers it.
- **Defect is environment-specific (production only)** → write a test that covers the code path even if it cannot reproduce the exact environment. State that the environment gap exists.
- **Test is inherently flaky** → address the underlying flakiness (add a wait, fix ordering, reset global state) before committing the test.
- **Fix breaks an unrelated test** → do not disable the test. Read the failure. The unrelated test is protecting something. Fix the regression or update the test with an explanation.

## Deliverables

1. A failing test before the fix (name, file, failure message).
2. The fix.
3. A passing test after the fix.
4. A negative-path test for the risk covered.
5. A passing test suite (no new failures).
