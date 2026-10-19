---
name: java-spring-boot
description: Build and maintain Java 21 and Spring Boot services with small, testable, backward-compatible changes.
entryType: instruction_skill
category: engineering
tags: java, spring-boot, backend
version: 0.1.0
validationStatus: validated
sourceId: just-do-it-local
---

# Java / Spring Boot engineering

- Understand the existing architecture and conventions before editing.
- Prefer the smallest correct change; do not redesign unrelated components.
- Preserve public APIs and existing behavior unless a change is explicitly required.
- Add or update focused tests for changed behavior and regression cases.
- Validate input at boundaries; return actionable errors without leaking secrets.
- Avoid blocking calls inside reactive pipelines. If the project uses virtual threads, follow its existing concurrency conventions.
- Before finishing, run relevant tests and report what changed, what was tested, and any remaining risks.
