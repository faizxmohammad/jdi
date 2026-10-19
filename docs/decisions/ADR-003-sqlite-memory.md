# ADR-003: SQLite + FTS5 for project memory (local / private MVP)

## Status

Accepted

## Date

2026-10-19

## Context

The early roadmap (`docs/implementation.md`) suggested PostgreSQL + FTS as the initial memory store. The implemented product is a **local-first / private self-host** MCP server for solo operators and small private teams. Adding Postgres for MVP would raise ops cost without matching the deployment posture.

Node 22+ exposes `node:sqlite` (experimental). We already depend on Node `>=22.14`.

## Decision

1. Use **SQLite + FTS5** via `node:sqlite` for project memory in `local` and `private` modes.
2. Default path: `JUST_DO_IT_MEMORY_PATH=./data/memory.sqlite`.
3. Docker Compose: host `./data` bind-mounted to `/data/memory`; file is `/data/memory/memory.sqlite`.
4. Defer PostgreSQL until one of these triggers:
   - Multi-node / multi-writer deployment
   - Concurrent write load that SQLite cannot sustain
   - Org requirement for a managed SQL service
5. Do **not** add embeddings until exact FTS retrieval quality is measured on real project memory (see eval / memory tests).

## Consequences

- Roadmap language that says “begin with PostgreSQL” is superseded for MVP by this ADR.
- Operators must accept Node 22+ and the experimental `node:sqlite` API risk (tracked in `docs/known-gaps.md`).
- Backup/restore is file-copy based (`docs/operations.md`).
- Public multi-tenant hosting remains blocked independently of this storage choice.
