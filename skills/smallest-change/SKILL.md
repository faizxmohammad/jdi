---
name: smallest-change
description: Make the smallest complete code change that solves the request; read callers and tests before editing; name what was left out and any remaining risk.
entryType: instruction_skill
category: delivery
tags: yagni, diff, scope, refactoring
triggers: smallest change, yagni, over-engineering, ponytail, simplest solution, minimal change, just fix
provides: small-diff
outputs: A complete diff plus one line naming what was skipped and any remaining risk.
version: 0.2.0
validationStatus: validated
sourceId: just-do-it-local
---

# Smallest complete change

## Purpose and scope

Use this skill when the task is a focused fix, feature addition, or refactoring where the scope must be tightly bounded. It prevents scope creep, over-engineering, and changes that touch code unrelated to the request.

Activate it when:
- The request describes a specific, bounded change: "fix X", "add Y to endpoint Z", "rename this field".
- The user explicitly asks for the "smallest" or "minimal" change.
- A bug has a clear root cause and the fix should be surgical.

Do not activate it when:
- The task is exploratory ("understand how this works") — use `repo-orientation` first.
- The task requires a broad refactoring explicitly requested by the user.
- The task is a migration that inherently touches many files.

## Prerequisites

Before editing any file:
1. **State the request in one sentence.** If you cannot, the scope is not clear. Ask.
2. **Read the file(s) the change must touch.** Do not skip this step. Code written without reading the context is wrong by default.
3. **Read callers of any function or endpoint you will change.** A function signature change without reading callers will break them.
4. **Read the existing tests for the changed code.** Know whether the test covers the case you are fixing. If it does, your fix must not break it.

## Workflow

### 1. Establish the scope

Write a scope statement before writing code:
- What is changing?
- Which file(s) and which lines?
- What is explicitly NOT changing?

Example: "Changing the null-check in `src/pricing/rate.ts:42`. Not changing the caller in `src/booking/checkout.ts` or the test for `calculateRate`."

If the scope grows while reading the code, revisit the original request. Do not silently expand.

### 2. Check for an existing helper

Before adding new code:
- Search for a function that already does what you need.
- Search for an existing utility module (in `src/utils`, `src/lib`, `src/helpers`, or equivalent).
- If an existing helper almost does what you need but not quite, consider whether the helper can be extended — one small extension is smaller than a new function.

Use the standard library or an installed dependency before adding a package.

### 3. Make the change

Apply only what the scope statement specifies. Specifically:
- Do not add options, flags, or configuration for features nobody asked for.
- Do not add an abstraction for a single call site.
- Do not rename unrelated variables or reformat unrelated code in the same commit.
- Do not add a wrapper around a call you're making once.

A bug fix should correct the shared cause, not each symptom. If five call sites have the same bug, fix the shared function, not all five call sites individually.

### 4. Keep existing safeguards

Do not remove or weaken:
- Validation on user input.
- Error handling for failure cases.
- Authentication or authorization checks.
- Accessibility attributes on UI components.
- Existing tests that the change renders incorrect.

If an existing test now fails because the behavior intentionally changed, update the test with an explanation of why the invariant changed. Do not delete it.

### 5. Add a focused test

For a non-trivial fix: add one test that:
- Fails against the unfixed code.
- Passes after the fix.

For a feature addition: add one test for the new behavior.

Do not add a test that exists primarily to increase coverage without covering a real risk.

### 6. Write the skip-and-risk line

After the change, write one line:
> Skipped: [list of improvements or expansions not done]. Remaining risk: [what was not tested or what could still fail].

This line is mandatory. Its purpose is to communicate scope honestly to reviewers.

## Decision rules

- **Correct the shared cause, not symptoms.** Five duplicated call sites with the same bug need one fix in the shared function.
- **Reuse before adding.** An existing helper with 90% of the logic is better than a new function with 100%.
- **One package before none.** The standard library is better than a dependency; a current dependency is better than a new one.
- **Abstraction threshold: one call site does not justify a wrapper.** Only abstract when there are at least two call sites that benefit.
- **Small diff is not a synonym for incomplete.** The change must be complete for the stated scope. Incomplete changes that save lines at the cost of correctness fail this skill.

## Tool contracts

This skill uses no MCP tools. File reading and editing use native tools.

## Verification and acceptance criteria

A change is complete when:
1. It solves the stated request.
2. The diff touches only files in the scope statement.
3. All existing tests pass.
4. A new test covers the fix or feature (unless the change is trivially covered by existing tests).
5. The skip-and-risk line is written.

## Failure handling

- **Reading the code reveals the change is larger than stated** → stop. Re-scope with the user. Do not proceed with a larger change without agreement.
- **An existing test breaks because of the fix** → the test is protecting a real invariant. Either fix the code to preserve it, or update the test with a documented reason.
- **Cannot find a shared cause** → the symptoms may not share a cause. State this. Propose fixing the most important instance and test it.

## Deliverables

1. Diff (smallest set of files touched).
2. One new test (or confirmation that existing tests cover it).
3. Skip-and-risk line: what was left out and any known remaining risk.
