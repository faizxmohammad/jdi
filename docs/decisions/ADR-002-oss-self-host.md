# ADR-002: Open-source self-hosted product

## Status

Accepted

## Date

2026-10-19

## Context

Just Do It is maintained as a free, self-hosted MCP server. Operators run it locally or on a private network and issue their own API tokens.

## Decision

1. Distribute Just Do It as open-source software (MIT).
2. Support `local` and `private` deployment modes; refuse `public` until stronger public-internet auth exists.
3. Operators create tokens (`JUST_DO_IT_TOKEN` / token file) and configure agents with bearer auth.
4. The skill catalog is the `skills/` tree in this repository (and optional private org catalogs). Skills are first-party catalog content.

## Consequences

- README and docs focus on install, run, and MCP configuration.
- The catalog is the first-party `skills/` tree in this repository.
