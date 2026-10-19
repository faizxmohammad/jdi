# Operations — secrets, backups, incidents

Last updated: 2026-10-19.

## Secret management

- Keep `.env` out of git. Generate tokens with `openssl rand -hex 32`.
- Prefer a secrets manager or root-owned `0600` `.env` on the host.
- Never put tokens in skill content, chat logs, or committed fixtures.
- Application audit/memory logs omit Authorization headers and memory bodies.
- Rotate: issue a new credential (`JUST_DO_IT_TOKEN` or tokens file entry), update clients, revoke the old credential, restart.

## Rate limits and payloads

- MCP route uses an in-memory IP rate limiter (`JUST_DO_IT_RATE_LIMIT_MAX`, `JUST_DO_IT_RATE_LIMIT_WINDOW_MS`).
- JSON body limit: `JUST_DO_IT_JSON_BODY_LIMIT` (default `1mb`).
- These are self-host controls, not a WAF. Put a reverse proxy / Tailscale ACL in front for remote private access.

## Memory paths by deployment

| Deployment | Env / config | Path to back up |
|---|---|---|
| Local Node (default) | `JUST_DO_IT_MEMORY_PATH` default | `./data/memory.sqlite` |
| Custom local path | set `JUST_DO_IT_MEMORY_PATH` | that absolute/relative path |
| Docker Compose | `JUST_DO_IT_MEMORY_PATH=/data/memory/memory.sqlite` | Host directory `./data/` (bind mount of `/data/memory`) |

Catalog (Compose): host `./skills` → `/data/skills` (read-only).

Do not use world-writable (`777`) permissions on `./data`. Own the directory as the container UID (typically `100:100` on this image) with mode `700`. See `docs/quick-start.md`.

## Backup (SQLite memory)

1. Stop or quiesce writers (`docker compose stop just-do-it` or stop the Node process).
2. Copy the memory file for your mode (table above).
3. Store the copy offline with restricted permissions (`chmod 600` on the backup file).
4. Optional: also archive `skills/` and `catalog/sources.manifest.json` for full rebuild.

Automated smoke: `tests/backup-restore.test.ts` copies a SQLite file and reopens it.

## Restore

1. Stop the service.
2. Replace the live SQLite path with the backup copy (keep a safety copy of the broken file).
3. Ensure the file is writable by the process user (Compose: `chown` to container `app` UID — not `chmod 777`).
4. Start the service and hit `/health/ready`.
5. Verify with `export_project_memory` or `list_project_memory` for a known `ownerId`/`projectId`.

## Incident response (minimal)

1. Record impact and versions.
2. If credential leak suspected: revoke affected tokens immediately; rotate `JUST_DO_IT_TOKEN` / tokens file.
3. Contain: stop public exposure (disable Funnel, unpublish ports); keep loopback/Tailscale only.
4. Preserve logs (`audit` / `memory` lines — no content bodies expected).
5. Restore from last good backup if integrity is in doubt.
6. Fix root cause; add regression tests when applicable.
7. Report security issues per `SECURITY.md`.

## Health

- `GET /health/live` — process up (no auth)
- `GET /health/ready` — catalog searchable (no auth)
