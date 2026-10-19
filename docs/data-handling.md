# Data handling, telemetry, and security limitations

Last updated: 2026-10-19 (Phase 6).

## What data the server stores

| Data | Where | Notes |
|---|---|---|
| Skill catalog | `skills/` on disk (Git-backed) | Treat bodies as untrusted instructions |
| Project memory | SQLite (`JUST_DO_IT_MEMORY_PATH`) | Scoped by bound `ownerId` + client `projectId` |
| Sync state / snapshots | `~/.just-do-it/` (CLI) | Local to the operator machine |
| Auth credentials | `.env` and optional tokens file | Never commit; rotate if exposed |

## Telemetry

Just Do It **does not** phone home. There is no product analytics, crash reporter, or usage beacon in this codebase.

Operators may collect their own logs from the process and reverse proxy. Audit events omit tokens and memory content bodies (see `docs/operations.md`).

## Auth and isolation

- Bearer token → one `ownerId` binding.
- Memory tools reject owner spoofing.
- Default bind is loopback; Compose publishes `127.0.0.1` only.
- `JUST_DO_IT_DEPLOYMENT_MODE=public` refuses to start.

## Security limitations (honest)

- Not a multi-tenant public SaaS. No OIDC.
- In-memory rate limiter is per-process, not a WAF.
- Writable `skills/` mounts are trusted filesystem input; review before following skill instructions.
- Claude Code / Cursor integrations are Unverified on clean machines.
- See `docs/known-gaps.md` and `SECURITY.md` for reporting and residuals.

## Operator controls

- Delete memory via MCP tools or by removing the SQLite file (after backup).
- Revoke tokens via tokens file + restart (`docs/deployment-modes.md`).
- Backup/restore: `docs/operations.md`.
