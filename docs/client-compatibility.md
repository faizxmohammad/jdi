# Client compatibility and test procedures

Phase 0 defines supported clients and a manual verification procedure. Automated CI does **not** yet drive Claude Code or Cursor end-to-end; treat rows marked “unverified” as aspirational until a human runs the procedure below.

## Supported clients (as of 2026-10-19)

| Client | Transport | Versions / baseline | Status |
|---|---|---|---|
| Claude Code CLI | Streamable HTTP (`/mcp`) with `Authorization: Bearer` | Latest stable Claude Code CLI that supports `claude mcp add --transport http` | **Unverified** on clean machine |
| Cursor IDE | HTTP MCP via `~/.cursor/mcp.json` `url` + `headers` | Cursor builds that support HTTP MCP servers and `${env:VAR}` (or equivalent) in headers | **Unverified** on clean machine |
| Direct HTTP (dev/tests) | Express + `@modelcontextprotocol/sdk` Streamable HTTP, JSON response mode | Node.js `>=24.0.0`; MCP SDK locked via `package-lock.json` | **Verified** by automated suite (`npm test`) |

Notes:

- Server binds to loopback by default (`HOST=127.0.0.1`). Remote use is expected via Tailscale Serve, not public Funnel.
- Transport uses `enableJsonResponse: true`. Clients that require SSE-only Streamable HTTP flows are out of scope until tested.
- Native skill sync is separate from MCP discovery; both may be used together.
- Preferred sync path: `npm run just-do-it -- …` with `--target claude-code` or `--target cursor` (see README). Legacy: `scripts/sync-claude-skills.sh`.
- Compatibility for sync adapters (filesystem layout):

| Adapter | Default skills root | Override | Status |
|---|---|---|---|
| `claude-code` | `~/.claude/skills` | `JUST_DO_IT_CLAUDE_SKILLS` | **Verified** by automated temp-HOME tests (`tests/sync.test.ts`); clean-machine Claude Code UI still **Unverified** |
| `cursor` | `~/.cursor/skills` | `JUST_DO_IT_CURSOR_SKILLS` | **Verified** by automated temp-HOME tests; clean-machine Cursor UI still **Unverified** |

## Manual test procedure (Claude Code)

Prerequisites: local server running (`npm run dev` or Docker), `JUST_DO_IT_TOKEN` set in the shell that launches Claude Code.

1. Health: `curl -sS http://127.0.0.1:8080/health/live` → `{"status":"UP"}`.
2. Reject missing auth: `curl -sS -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:8080/mcp -H 'content-type: application/json' -d '{}'` → expect `401`.
3. Register MCP (adjust hostname for local or Tailscale):

```bash
export JUST_DO_IT_TOKEN='your-token'
claude mcp add --transport http --scope user \
  --header "Authorization: Bearer ${JUST_DO_IT_TOKEN}" \
  just-do-it "http://127.0.0.1:8080/mcp"
claude mcp list
```

4. In a Claude Code session, confirm tools appear: `search_skills`, `get_skill`, `just_do_it_version`.
5. Call `just_do_it_version` → JSON with `serverVersion`, `catalogVersion`, `capabilities`.
6. Call `search_skills` with an empty or short query → skill summaries **without** full bodies; each summary includes provenance fields when present.
7. Call `get_skill` with a known id (for example `java-spring-boot`) → content, `sha256`, provenance, version.
8. Call `get_skill` with `../escape` or a missing id → error path, no file leak.
9. Record: Claude Code version (`claude --version` if available), date, pass/fail in a PR note or update the Status column above.

## Manual test procedure (Cursor)

Prerequisites: same local server and token; Cursor restarted after config changes.

1. Add server entry to `~/.cursor/mcp.json` (see README). Ensure `JUST_DO_IT_TOKEN` is visible to Cursor’s process environment.
2. Open MCP / tools UI and confirm `just-do-it` connects (no auth errors).
3. Invoke `just_do_it_version`, `search_skills`, and `get_skill` as in steps 5–8 above.
4. Record Cursor version (About), date, and pass/fail.

## Automated regression (required every change)

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Same gates run in GitHub Actions (`.github/workflows/ci.yml`), plus production `npm audit --omit=dev`. These prove server auth, rate limits, catalog read/search, schema/manifest invariants, and MCP initialize/tool listing over HTTP. They do **not** replace client UI verification.

## When to update this doc

- After a successful or failed client run (change Status / add version).
- When MCP SDK major upgrades change transport requirements.
- When adding a new official client integration.
