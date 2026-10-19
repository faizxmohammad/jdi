# Known gaps — Just Do It

Last updated: 2026-10-19.

## Security

- Auth is bearer tokens with per-token `ownerId` binding. Mode `public` refuses to start.
- No OAuth/OIDC yet.
- In-memory rate limiter is per-process (not a WAF).
- MCP tools do not execute skill scripts.
- Keep `.env` out of git; rotate tokens if leaked.
- Catalog reads reject symlinks and path escape (`tests/catalog.test.ts`).
- CI audits production deps; Vitest toolchain may still report full-tree audit findings.

## Compatibility

- Claude Code and Cursor setup is documented; clean-machine UI verification is still manual (**Unverified**).
- Streamable HTTP uses JSON response mode; SSE-only clients are untested.

## Catalog

- Catalog source of truth is `skills/` with provenance `just-do-it-local`.
- Frontmatter must declare `sourceId` explicitly.
- Summary index is in-process; restart after on-disk catalog changes (or invalidate index).
- `just-do-it-local` `sourceUrl` is a placeholder until the public repo URL is set.

## Product

- `recommend_skills` uses metadata/keyword ranking (no embeddings yet). Eval evidence: `docs/recommend-eval.md`.
- Memory uses SQLite + FTS5 (`node:sqlite`) per ADR-003 — requires **Node >=24** (Node 22.14 CI lacked FTS5). Postgres deferred.
- Docker `./data` must be owned by container UID (typically 100); never default to `chmod 777`.
- Memory capture is explicit only (agent submits context).
- Sync CLI targets Claude Code / Cursor skill directories; override paths via env if needed.
- Team orgs: role ceilings + scopes enforced; Phase 7 is out-of-sequence preview (`tasks/phase-gate-status.md`).

## Release residuals (Phase 6 human gates)

- Publish remote URL, first tag `v0.1.0`, and Actions green check still need a human.
- Claude Code / Cursor clean-machine UI still **Unverified**.
- **Accepted CI gap:** ESLint/Prettier and container image scanning are **not** in `.github/workflows/ci.yml`. Current CI = typecheck, test, build, production `npm audit`. Track under `docs/release-readiness.md` — do not claim they run until added.
- Docker live UID/persistence/restore: operator checklist in `docs/release-readiness.md` (not claimed from docs alone).
- Recommend eval expanded but still small-sample — `docs/recommend-eval.md`.
