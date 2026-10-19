# Quick start — clean install from zero

Goal: run Just Do It locally without founder help. Modes: **local** (loopback) or **private** (Tailscale / private network). Public internet hosting is **BLOCKED**.

Canonical tool names: `docs/mcp-tool-contract.md`.

## Prerequisites

- Node.js **22.14+** and npm (for local run)
- Or Docker Engine + Docker Compose
- Optional: Tailscale for private remote MCP access

## 1. Clone and configure

```bash
git clone <repository-url>
cd just-do-it   # or your clone directory name (e.g. build-my-product-mcp)
cp .env.example .env
openssl rand -hex 32   # paste into JUST_DO_IT_TOKEN
```

Edit `.env`:

- `JUST_DO_IT_TOKEN` — at least 32 characters
- `JUST_DO_IT_OWNER_ID` — your solo owner id (e.g. `alice`)
- Leave `JUST_DO_IT_DEPLOYMENT_MODE` as `local` or `private` — never `public`

The app loads `.env` from the project root automatically when you run `npm run dev` / `npm start`.

## 2a. Local Node path

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

Memory file (default): `./data/memory.sqlite` (`JUST_DO_IT_MEMORY_PATH`).

Health check:

```bash
curl -sS http://127.0.0.1:8080/health/live
```

Expect `{"status":"UP"}`.

## 2b. Docker Compose path

The image runs as non-root user `app`. Measured on this project’s image (2026-10-19): **`uid=100(app) gid=101(app)`**. Confirm on your host:

```bash
docker compose run --rm --entrypoint id just-do-it
# expect: uid=100(app) gid=101(app)  (gid may differ by base image)
```

Prepare the host data directory with **least privilege** (do **not** use `chmod 777` for normal installs):

```bash
mkdir -p data
# Match uid/gid from `id` above
sudo chown -R 100:101 data
chmod 700 data
```

Then:

```bash
docker compose up -d --build
curl -sS http://127.0.0.1:8080/health/live
```

| Mode | Memory path |
|---|---|
| Local Node | `./data/memory.sqlite` (default env) |
| Compose | Host `./data/` → container `/data/memory/`; file `/data/memory/memory.sqlite` |

Catalog in Compose: host `./skills` mounted read-only at `/data/skills`.

### Temporary diagnostic only (insecure)

If you cannot `chown` and need a one-off debug on a single-user laptop, some operators temporarily use a world-writable `data/` dir. That is **not** a normal install step and must not be copied into shared or multi-user hosts. Prefer fixing ownership to the container UID.

## 3. Point a client at `/mcp`

Local examples (replace token / hostname for Tailscale):

**Claude Code**

```bash
export JUST_DO_IT_TOKEN='your-token'
claude mcp add --transport http --scope user \
  --header "Authorization: Bearer ${JUST_DO_IT_TOKEN}" \
  just-do-it "http://127.0.0.1:8080/mcp"
```

**Cursor** — `~/.cursor/mcp.json`:

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

Claude Code and Cursor clean-machine status: **Unverified** — see `docs/client-compatibility.md`. Automated suite verifies the HTTP MCP path.

## 4. Smoke the catalog tools

Follow `docs/demo.md` (search, get, recommend, memory, skill pin).

## Next reading

| Doc | Purpose |
|---|---|
| [technical-overview.md](./technical-overview.md) | Architecture review pack |
| [mcp-tool-contract.md](./mcp-tool-contract.md) | Canonical tool names |
| [phase-gate-status.md](../tasks/phase-gate-status.md) | Honest phase rollup |
| [deployment-modes.md](./deployment-modes.md) | local / private / public BLOCKED |
| [operations.md](./operations.md) | Backup / restore paths |
| [source-policy.md](./source-policy.md) | Catalog source policy |
