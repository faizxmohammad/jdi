---
name: regression-testing
description: Add focused regression tests that fail when protected behavior breaks.
entryType: instruction_skill
category: engineering
tags: testing, regression, qa
version: 0.1.0
validationStatus: validated
sourceId: just-do-it-local
---

# Regression testing

- Every bug fix should include a regression test where feasible.
- Tests must fail when the behavior they protect is broken.
- Prefer the smallest test that covers the risk.
- Cover negative paths for auth, validation, and unsafe file handling.
