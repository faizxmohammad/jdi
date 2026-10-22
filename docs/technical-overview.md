# Just Do It — Technical overview (review draft)

**Audience:** engineering leads, peer reviewers, and coding agents evaluating the product  
**Product version:** 0.1.0  
**Last updated:** 2026-10-19  
**Status:** Self-hosted MCP server — local and private modes supported; public internet hosting refused

This document describes architecture, skill selection, the current catalog, client integration, and deployment. It is meant for design review and feature feedback, not as a marketing brief.

---

## 1. What this product is

**Just Do It** is a self-hosted **Model Context Protocol (MCP)** server. AI coding clients (Claude Code, Cursor, and similar) connect over HTTP, authenticate with a bearer token, and call tools to:

1. **Discover** engineering skills in a Git-backed catalog  
2. **Retrieve** full skill instructions (`SKILL.md` bodies)  
3. **Recommend** skills for a stated task (keyword / metadata ranking)  
4. Optionally **store and search project memory** (SQLite)  
5. Optionally **sync** catalog skills into Claude Code / Cursor skill directories via a local CLI (not via MCP write tools)

Skills are **instruction documents**, not executable plugins. The MCP server never runs skill scripts. The connected agent (or the client’s native skill loader after sync) is what follows the instructions.

---

## 2. Critical architecture fact: who “hears” the user prompt

**The MCP server does not intercept chat.**

```
User types in Claude Code / Cursor
        │
        ▼
AI client (LLM + tool-calling loop)
        │  decides whether to call MCP tools
        ▼
HTTP POST http://127.0.0.1:8080/mcp
  Authorization: Bearer <token>
        │
        ▼
Just Do It Express + Streamable HTTP MCP
        │
        ├── search_skills / recommend_skills / get_skill  → reads ./skills
        └── memory_* tools → SQLite (optional)
```

| Layer | Responsibility |
|---|---|
| Chat UI / client | Owns the user prompt and conversation |
| LLM agent | Chooses tools; typically passes a task string into `recommend_skills` or a query into `search_skills` |
| Just Do It | Ranks / returns catalog skills; does **not** auto-delegate or force a skill |

**“Delegation” in practice** is a multi-step agent loop:

1. Agent (or user) recognizes a coding task.  
2. Agent calls `recommend_skills({ task: "<user intent>" })` and/or `search_skills`.  
3. Agent picks a skill id from the result (or asks the user).  
4. Agent calls `get_skill({ skillName })` and loads the instruction body into context.  
5. Agent follows those instructions while editing code.

Alternatively, after `npm run just-do-it -- install <skillId>`, the skill file also lives under `~/.claude/skills` or `~/.cursor/skills`, where the **client** may load it through its own skill system. That path bypasses `get_skill` for subsequent turns but still uses the same catalog as source of truth.

There is **no** server-side router that silently maps every chat message to a skill.

---

## 3. High-level architecture

```
┌─────────────────────────────────────────────────────────────┐
│  AI client (Claude Code / Cursor)                           │
│  MCP config → url + Authorization: Bearer …                 │
└───────────────────────────┬─────────────────────────────────┘
                            │ Streamable HTTP (/mcp)
┌───────────────────────────▼─────────────────────────────────┐
│  Express app (src/app.ts)                                   │
│  helmet · JSON body limit · rate limit · bearer auth        │
│  GET /health/live · GET /health/ready · POST /mcp           │
└───────┬─────────────────────┬───────────────────────────────┘
        │                     │
        ▼                     ▼
┌───────────────────┐   ┌─────────────────────────────┐
│ SkillCatalog      │   │ MemoryService + SQLite FTS5 │
│ (src/skills/)     │   │ (src/memory/)               │
│ reads JUST_DO_IT_ │   │ ownerId + projectId isolation│
│ CATALOG_PATH      │   └─────────────────────────────┘
└─────────┬─────────┘
          │
          ▼
┌─────────────────────────────┐
│ skills/<id>/SKILL.md        │  ← default catalog on disk
│ catalog/sources.manifest.json│ ← provenance / import gate
└─────────────────────────────┘
```

### Main packages / directories

| Path | Role |
|---|---|
| `src/index.ts` | Process entry — starts HTTP server |
| `src/app.ts` | Express wiring, auth, MCP request handling |
| `src/mcp/server.ts` | MCP tool registration |
| `src/skills/catalog.ts` | Index + search + read + recommend entry |
| `src/skills/recommend.ts` | Ranking / abstain / clarify logic |
| `src/catalog/*` | Frontmatter schema, file IO, import gate |
| `src/memory/*` | Project memory store + authz |
| `src/security/*` | Credentials, bearer auth, rate limit, audit |
| `src/sync/*` + `src/cli/just-do-it.ts` | Install skills into client skill dirs |
| `skills/` | **Default skill catalog** (content) |
| `catalog/sources.manifest.json` | Allowed `sourceId` provenance records |

---

## 4. The `skills/` folder (catalog)

### Why it exists

`skills/` is the **on-disk skill library**. Default env:

```bash
JUST_DO_IT_CATALOG_PATH=./skills
```

Every MCP catalog tool and the sync CLI read this tree (or an org-private override path). Without it (or another path with the same layout), search / get / recommend return nothing useful.

### Layout

```text
skills/
  VERSION                          # optional catalog version string
  java-spring-boot/
    SKILL.md
  nodejs-architecture/
    SKILL.md
  database-migrations/
    SKILL.md
  regression-testing/
    SKILL.md
  hotel-booking-debugger/
    SKILL.md
```

### `SKILL.md` contract

YAML frontmatter + markdown body. Required / important fields (see `src/catalog/schema.ts`):

| Field | Purpose |
|---|---|
| `name` | Display / id alignment |
| `description` | Used heavily by search + recommend |
| `entryType` | Usually `instruction_skill` |
| `category` | Filter / ranking |
| `tags` | Ranking tokens |
| `version` | Immutable pin for `get_skill` / sync |
| `validationStatus` | e.g. `validated` (rejected skills skipped) |
| `sourceId` | Must exist in `catalog/sources.manifest.json` |

Body = instructions the agent should follow. Treated as **untrusted text** (never executed by Just Do It).

### Current shipped skills

Thirteen first-party skills under `skills/`, all `sourceId: just-do-it-local`. The original five engineering/domain examples remain. Eight later skills encode workflows studied from external projects without copying their text. Detail and the project-by-project decision are in `docs/capability-integration-report.md`.

| Skill id | Category | Intent |
|---|---|---|
| `java-spring-boot` | engineering | Java 21 / Spring Boot services |
| `nodejs-architecture` | engineering | Node.js TypeScript module boundaries |
| `database-migrations` | engineering | Backward-compatible DB migrations and rollback |
| `regression-testing` | engineering | Regression tests for protected behavior |
| `hotel-booking-debugger` | domain | Hotel booking request / inventory / pricing / payment |
| `smallest-change` | delivery | Smallest complete diff |
| `current-library-docs` | documentation | Context7 lookup before API code |
| `repo-orientation` | analysis | Entry-point reading with cited vs inferred claims |
| `interface-review` | interface | One design system, thesis, accessibility |
| `browser-verification` | verification | Playwright CLI in the user environment |
| `find-catalog-skill` | catalog | Search this catalog before an outside install |
| `session-skill-review` | catalog | Draft a skill for human review |
| `defensive-review` | security | Trust boundaries and secrets, no attack steps |

### Adding a skill

1. Create `skills/<id>/SKILL.md` with valid frontmatter.  
2. Ensure `sourceId` is allowed by the import gate / manifest.  
3. Restart the server (in-process summary index is built at load).  
4. Optionally: `npm run just-do-it -- install <id> --target claude-code|cursor`.

MCP tools are **read-only** for catalog content. Writes go through Git or `npm run import-skill`.

---

## 5. How user intent becomes a skill (selection flow)

### 5.1 End-to-end sequence (happy path)

```
1. User: "Add a Flyway migration for the bookings table with rollback"
2. Agent calls recommend_skills:
     { "task": "Add a Flyway migration for the bookings table with rollback",
       "projectContext": "Java Spring Boot service",   // optional
       "limit": 5 }
3. Server tokenizes task (+ context), applies declared triggers and the legacy synonym map,
   scores each authorized skill summary, returns ranked list + explanations.
4. Agent calls plan_capabilities for the same task. The plan names which bodies fit the
   context budget and which external tools (for example Context7) the skill requires.
5. Agent calls get_skill only for steps with includeBody=true.
6. Agent follows that body. External calls go through call_external_capability when the proxy is enabled, otherwise the agent uses the documented endpoint from the plan.
```

### 5.2 Tools involved

| Tool | Input | Output | When to use |
|---|---|---|---|
| `recommend_skills` | `task`, optional `projectContext`, `limit` | Ranked skills + evidence, or abstain / clarify | “What skill fits this work?” |
| `plan_capabilities` | `task`, optional budget | Ordered steps, body budget, required tools | Before loading several skills |
| `search_skills` | `query`, optional `category`, `limit` | Summaries (no full bodies) | Browse / keyword lookup |
| `get_skill` | `skillName`, optional `version` | Full body + digest + provenance | Load instructions before acting |
| `list_external_capabilities` | — | Context7 and Playwright CLI metadata, no secrets | See what is wired |
| `call_external_capability` | capability, tool, query fields | Docs payload, or `disabled` with the MCP URL | Library docs when a skill requires Context7 |
| `draft_skill_candidate` | name, description, body | Markdown, `persisted: false` | After a repeated correction |
| `just_do_it_version` | — | Server / catalog / capability metadata | Health / governance |

Memory tools (`save_project_context`, `get_project_context`, `search_project_memory`, …) are **separate**: they persist agent-submitted notes per `ownerId` + `projectId`. They do not auto-scrape the chat.

### 5.3 Recommendation algorithm (`metadata_weighted_v1`)

Implementation: `src/skills/recommend.ts`.

1. **Tokenize** task (+ optional `projectContext`); drop stopwords.  
2. **Expand** tokens via a legacy synonym map kept for the original seed skills. New skills declare `triggers` instead of new map entries.  
3. **Score** each catalog summary (not full bodies):  
   - declared trigger phrase ≈ +16  
   - id/name match ≈ +10 (generic tokens such as `review` and `skill` do not count)  
   - tag match ≈ +8  
   - category match ≈ +5  
   - description token ≈ +2  
   - `validationStatus=validated` ≈ +1  
4. Drop scores below `minScore` (default **8** for recommend mode).  
5. Sort descending; return top `limit` (default 5, max 10).  
6. **Abstain / clarify** instead of guessing when:  
   - task empty → `needs_clarification`  
   - fewer than 2 meaningful tokens → `needs_clarification`  
   - no skill above threshold → `insufficient_evidence`  
   - two skills nearly tied → `needs_clarification` with both candidates  

Each recommendation includes:

- `explanation` — human-readable why  
- `evidence[]` — `verified` (catalog facts) vs `inferred` (ranking)  
- `prerequisites[]` — honest about install state (instruction skills claim no local CLI)  
- `availability.claim` — always `available_in_catalog` (never “installed on machine”)

Eval harness: `npm run eval:recommend` (fixtures under `eval/`).

### 5.4 What the server does **not** do

- Does not subscribe to raw chat transcripts  
- Does not auto-pick or lock a skill without an agent tool call  
- Does not execute skill content  
- Does not invent skill ids outside the authorized catalog  
- Does not claim a skill is installed on the user’s laptop unless the separate sync CLI was used (and even then MCP still only claims “in catalog”)

---

## 6. Authentication and tenancy

### Solo / local (default)

```bash
JUST_DO_IT_TOKEN=<openssl rand -hex 32>   # ≥ 32 chars
JUST_DO_IT_OWNER_ID=<your-id>
JUST_DO_IT_DEPLOYMENT_MODE=local         # or private
```

- Every MCP request needs `Authorization: Bearer <JUST_DO_IT_TOKEN>`.  
- Token is permanently bound to `JUST_DO_IT_OWNER_ID`.  
- Memory tools require tool-arg `ownerId` to match that binding.

### Optional multi-token / team

- `JUST_DO_IT_API_TOKENS_PATH` — extra credentials (token → ownerId, optional `orgId` / `scopes`)  
- `JUST_DO_IT_ORGS_PATH` — org membership + optional private `catalogPath`  
- See `docs/team-model.md` and `docs/deployment-modes.md`

### Public mode

`JUST_DO_IT_DEPLOYMENT_MODE=public` **refuses to start**. No OIDC yet.

---

## 7. Local MCP integration

### 7.1 Run the server

```bash
git clone <repo-url>
cd jdi   # clone of https://github.com/faizxmohammad/jdi
cp .env.example .env
# set JUST_DO_IT_TOKEN + JUST_DO_IT_OWNER_ID
npm ci
npm run typecheck && npm test
npm run dev                 # http://127.0.0.1:8080
```

Health:

```bash
curl -sS http://127.0.0.1:8080/health/live
# {"status":"UP"}
```

MCP endpoint: `http://127.0.0.1:8080/mcp`

`.env` is loaded automatically from the project root.

### 7.2 Claude Code

```bash
export JUST_DO_IT_TOKEN='your-token'
claude mcp add --transport http --scope user \
  --header "Authorization: Bearer ${JUST_DO_IT_TOKEN}" \
  just-do-it "http://127.0.0.1:8080/mcp"
claude mcp list
```

### 7.3 Cursor

`~/.cursor/mcp.json` (or project MCP config):

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

Ensure Cursor’s process environment has `JUST_DO_IT_TOKEN`, then restart Cursor.

### 7.4 Optional: sync skills into the client skill directory

```bash
npm run just-do-it -- list --target claude-code
npm run just-do-it -- preview install java-spring-boot --target claude-code
npm run just-do-it -- install java-spring-boot --target claude-code
```

| Target | Default directory |
|---|---|
| `claude-code` | `~/.claude/skills` |
| `cursor` | `~/.cursor/skills` (overridable via env) |

Preview before apply; pin / rollback supported. See `npm run just-do-it -- help`.

### 7.5 Client verification status

Automated tests cover HTTP MCP auth and tools. **Claude Code / Cursor UI on a clean machine is still Unverified** — see `docs/client-compatibility.md`.

---

## 8. Deployment

### 8.1 Modes

| Mode | Env | Status |
|---|---|---|
| Local | `JUST_DO_IT_DEPLOYMENT_MODE=local` | Supported — loopback / solo |
| Private | `private` | Supported — private network / Tailscale HTTPS |
| Public | `public` | **Blocked** — process exits |

### 8.2 Production Node process

```bash
npm ci
npm run build
npm start    # node dist/index.js
```

Bind defaults: `HOST=127.0.0.1`, `PORT=8080`. For remote private access, put TLS in front (do not expose bare HTTP on the public internet).

### 8.3 Docker Compose

```bash
cp .env.example .env   # set TOKEN + OWNER_ID
mkdir -p data
# Own as container user `app` (typically UID 100) — see docs/quick-start.md
# sudo chown -R 100:100 data && chmod 700 data
docker compose up -d --build
curl -sS http://127.0.0.1:8080/health/live
```

Compose highlights (`docker-compose.yml`):

- Publishes **`127.0.0.1:8080` only** (not `0.0.0.0`)  
- Mounts `./skills` read-only → `/data/skills`  
- Mounts `./data` → `/data/memory` (SQLite at `/data/memory/memory.sqlite`)  
- Non-root, read-only rootfs, dropped caps, memory/CPU limits, healthcheck  
- Do **not** use `chmod 777` on `./data`  

### 8.4 Private remote access (Tailscale example)

```bash
tailscale serve --bg 8080
tailscale serve status
```

Point MCP clients at `https://<hostname>.ts.net/mcp` with the same bearer header. Prefer Serve over Funnel for memory-bearing deployments.

### 8.5 Ops references

| Doc | Topic |
|---|---|
| `docs/deployment-modes.md` | Modes, identity, TLS posture |
| `docs/operations.md` | Backup, restore, incidents |
| `docs/data-handling.md` | What is stored / not scraped |
| `SECURITY.md` | Vulnerability reporting |

---

## 9. Security boundaries (reviewers)

- Bearer tokens; no OAuth/OIDC yet  
- Rate limiting + JSON body size limits at the gateway  
- Catalog path traversal / symlink rejection in skill file reads  
- Skill content = untrusted instructions  
- Memory isolated by authenticated `ownerId` + `projectId`  
- Import gate fails closed for unauthorized `sourceId` / bad license status  
- Public hosting refused until stronger identity exists  

---

## 10. Feature surface for feedback

### Shipped today

- [x] Streamable HTTP MCP with bearer auth  
- [x] Catalog search / get / recommend  
- [x] Git-backed `skills/` catalog (13 first-party skills)  
- [x] `plan_capabilities`, external capability registry, optional Context7 proxy  
- [x] Project memory (explicit save/search)  
- [x] Local sync CLI to Claude Code / Cursor skill dirs  
- [x] Docker Compose + local Node run  
- [x] Optional multi-token / org foundation (private)  

### Honest gaps / candidates for lead + agent review

| Area | Current state | Feedback ask |
|---|---|---|
| Prompt → skill | Agent-mediated tool calls only | Should we add client-side hooks / system prompts that *require* `recommend_skills` before coding tasks? |
| Ranking | Keyword + synonym weights; eval in `docs/recommend-eval.md` | Embeddings / hybrid search worth the complexity? |
| Catalog size | 13 first-party skills | Which real tasks still abstain? See `docs/capability-integration-report.md` |
| Sync vs MCP get | Dual path | Prefer always `get_skill`, or always install-to-client-dir? |
| Memory | Explicit agent submit | Auto-capture of decisions — product risk vs value? |
| Auth | Shared bearer / file tokens | When do we need OIDC for private team hosts? |
| Eval | Offline recommend harness | Expand golden tasks for our real workloads? |
| Clients | UI Unverified | Who runs Claude Code / Cursor clean-machine checklist? |

---

## 11. Suggested review prompts (for other agents)

Copy/paste for an architecture or product review agent:

1. Trace one user prompt from chat → `recommend_skills` → `get_skill` → code change. Where can this fail silently?  
2. Critique `metadata_weighted_v1` for our stack (false positives / abstains).  
3. Propose 5–10 additional `skills/*/SKILL.md` entries tied to our actual repos — keep them instruction-only.  
4. Compare “MCP get_skill every time” vs “sync CLI install once” for team onboarding.  
5. Threat-model a Tailscale-private deploy with shared tokens vs per-person tokens.  
6. List MVP feature cuts vs must-haves before wider internal rollout.

---

## 12. Related docs

| Doc | Purpose |
|---|---|
| [README.md](../README.md) | Install / run / MCP config (operator-facing) |
| [quick-start.md](./quick-start.md) | Zero → health |
| [demo.md](./demo.md) | Manual tool walkthrough |
| [deployment-modes.md](./deployment-modes.md) | local / private / public |
| [team-model.md](./team-model.md) | Orgs / scopes |
| [client-compatibility.md](./client-compatibility.md) | Client matrix |
| [known-gaps.md](./known-gaps.md) | Residuals |
| [ADR-002](./decisions/ADR-002-oss-self-host.md) | Self-host OSS posture |

---

## 13. One-sentence summary

**Just Do It is a private MCP catalog of instruction skills: the AI client owns the user prompt; this server ranks and returns matching `SKILL.md` content (and optional memory/sync), and never executes or auto-routes chat on its own.**
