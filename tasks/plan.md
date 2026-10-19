# Implementation Plan: Phase 0 → Phase 1 (Just Do It)

## Overview

Execute `docs/implementation.md` in order. Phase 0 establishes schema, source licensing manifest, docs, and provenance-aware catalog APIs on top of the existing TypeScript MCP starter. Phase 1 then adds import/validation for approved sources only.

## Architecture Decisions

- **Git-backed local catalog first** — `skills/` remains the source of truth; PostgreSQL deferred until Phase 3 multi-user memory.
- **Schema in TypeScript + Zod** — single runtime validator shared by catalog reads and future import CLI.
- **Source manifest is metadata-only until license decision is `approved_for_import`** — no catalog content mirrored without a recorded decision.
- **Product slug `just-do-it`** — env `JUST_DO_IT_*`, MCP server name `just-do-it`, tool `just_do_it_version`.
- **Provisional MIT license** — open decision in implementation.md §19; revisit if trademark/contribution policy changes.

## Task List

See `tasks/todo.md`.

## Risks

- Inventory URLs in implementation.md §4 have duplicates/typos (external API tooling/diagram tooling/security tooling); manifest records intended URLs and marks status `needs_review`.
- Client compatibility (Claude Code / Cursor) not yet verified end-to-end in this phase.
- `.env` bearer token is shared-secret local auth only (Phase 5 for public hosting).

## Out of scope (later phases)

- `recommend_skills`, project memory tools, CLI install/rollback, OAuth, Postgres.
