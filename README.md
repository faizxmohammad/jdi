# Just Do It

Just Do It is a self-hosted **MCP server** that gives AI coding agents (Claude Code, Cursor, and similar clients) a shared catalog of engineering skills, plus optional project memory and recommendations.

You run the server on your machine or private network, create an API token, and point your agent’s MCP config at it.

## What it does

| Capability | MCP tool(s) |
|---|---|
| Search the skill catalog | `search_skills` |
| Fetch a skill’s instructions | `get_skill` |
| Recommend skills for a task | `recommend_skills` |
| Save / search project memory | `save_project_context`, `get_project_context`, `search_project_memory`, plus list/delete/export helpers |
| Server / catalog version | `just_do_it_version` |

Skills live as folders under `skills/<name>/SKILL.md`. You can also sync approved skills into Claude Code or Cursor skill directories with the local CLI.

## Requirements

- Node.js **22.14+** and npm  
- Optional: Docker + Docker Compose  

## Install

```bash
git clone <your-repo-url>
cd build-my-product-mcp
cp .env.example .env
npm ci
```

Edit `.env` (both token and owner id are required):

```bash
# openssl rand -hex 32
JUST_DO_IT_TOKEN=your-32+-character-secret
JUST_DO_IT_OWNER_ID=your-name-or-id
JUST_DO_IT_DEPLOYMENT_MODE=local
```

`npm run dev` and `npm start` load `.env` from the project root automatically. Vars already set in your shell win over `.env`.

## Run

### Local development

```bash
npm run typecheck
npm test
npm run dev
```

Server listens on `http://127.0.0.1:8080` by default.

Health check:

```bash
curl http://127.0.0.1:8080/health/live
```

### Production build

```bash
npm run build
npm start
```

### Docker

```bash
cp .env.example .env
# set JUST_DO_IT_TOKEN and JUST_DO_IT_OWNER_ID
mkdir -p data
# Own ./data as the Compose user `app` (typically UID 100) — see docs/quick-start.md
# sudo chown -R 100:100 data && chmod 700 data
docker compose up -d --build
curl http://127.0.0.1:8080/health/live
```

Compose binds only to loopback on the host. Prefer Tailscale (or similar) for remote access instead of exposing port 8080 to the public internet. Do not use `chmod 777` on `./data`.

```bash
tailscale serve --bg 8080
tailscale serve status
```

Use the HTTPS hostname from Tailscale with `/mcp` appended.

More detail: [docs/quick-start.md](./docs/quick-start.md), [docs/deployment-modes.md](./docs/deployment-modes.md), [docs/operations.md](./docs/operations.md).

## Configure your AI agent (MCP)

The MCP endpoint is:

```text
http://127.0.0.1:8080/mcp
```

(or `https://YOUR-TAILSCALE-HOSTNAME.ts.net/mcp` when using Tailscale)

Every MCP request needs:

```http
Authorization: Bearer <JUST_DO_IT_TOKEN>
```

### Claude Code

```bash
export JUST_DO_IT_TOKEN='your-token'
claude mcp add --transport http --scope user \
  --header "Authorization: Bearer ${JUST_DO_IT_TOKEN}" \
  just-do-it "http://127.0.0.1:8080/mcp"
claude mcp list
```

### Cursor

Add to `~/.cursor/mcp.json` (or your project MCP config):

```json
{
  "mcpServers": {
    "just-do-it": {
      "url": "http://127.0.0.1:8080/mcp",
      "headers": {
        "Authorization": "Bearer ${env:JUST_DO_IT_TOKEN}"
      }
    }
  }
}
```

Set `JUST_DO_IT_TOKEN` in the environment Cursor inherits, then restart Cursor.

### Multiple users (optional)

Use `JUST_DO_IT_API_TOKENS_PATH` pointing at a JSON file of tokens, each bound to an `ownerId`. See [docs/deployment-modes.md](./docs/deployment-modes.md) and [docs/team-model.md](./docs/team-model.md).

## Sync skills into Claude Code / Cursor

```bash
npm run just-do-it -- list --target claude-code
npm run just-do-it -- preview install java-spring-boot --target claude-code
npm run just-do-it -- install java-spring-boot --target claude-code
```

Targets: `claude-code` (`~/.claude/skills`), `cursor` (`~/.cursor/skills`, overridable via env). Preview before apply; pin/rollback supported. See `npm run just-do-it -- help`.

## Technical overview (for review)

Architecture, skill selection flow, current catalog, MCP integration, and deploy notes for leads / agents:

[docs/technical-overview.md](./docs/technical-overview.md) · [docs/release-readiness.md](./docs/release-readiness.md) · [docs/mcp-tool-contract.md](./docs/mcp-tool-contract.md) · [tasks/phase-gate-status.md](./tasks/phase-gate-status.md) · [docs/source-policy.md](./docs/source-policy.md)

## Demo walkthrough

[docs/demo.md](./docs/demo.md)

## Development

```bash
npm run typecheck
npm test
npm run build
```

Contribution guide: [CONTRIBUTING.md](./CONTRIBUTING.md) · [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) · [SECURITY.md](./SECURITY.md)

## License

[MIT](./LICENSE)
