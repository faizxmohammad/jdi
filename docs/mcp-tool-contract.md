# Canonical MCP tool contract

**Source of truth:** registered tools in `src/mcp/server.ts`  
**Product name:** Just Do It (`package.json` name: `just-do-it`)  
**Last reconciled:** 2026-10-19

All docs, demos, and examples must use these names. Do not use legacy aliases (`skills_hub_version`, Skills Hub, etc.).

## Endpoint

| Item | Value |
|---|---|
| Transport | Streamable HTTP (JSON response mode) |
| Path | `/mcp` |
| Auth | `Authorization: Bearer <token>` |
| Local default URL | `http://127.0.0.1:8080/mcp` |

## Tools

| Tool | Required scope | Purpose |
|---|---|---|
| `search_skills` | `catalog:read` | Search catalog summaries |
| `get_skill` | `catalog:read` | Fetch full `SKILL.md` + digest |
| `recommend_skills` | `catalog:read` | Rank skills for a task string |
| `just_do_it_version` | (any authenticated) | Server / catalog / capability metadata |
| `save_project_context` | `memory:write` | Save a memory record |
| `get_project_context` | `memory:read` | Retrieve project memory for a task |
| `search_project_memory` | `memory:read` | FTS search within owner+project |
| `list_project_memory` | `memory:read` | List records |
| `delete_project_memory` | `memory:write` | Delete a record |
| `export_project_memory` | `memory:read` | Export records |

Exact input schemas live in `src/mcp/server.ts` (Zod). Prefer reading that file over paraphrasing args in other docs.

## Package scripts (canonical)

| Script | Purpose |
|---|---|
| `npm run dev` | Local server (`tsx watch`) |
| `npm start` | Production `node dist/index.js` |
| `npm test` | Vitest |
| `npm run just-do-it` | Skill sync CLI |
| `npm run import-skill` | Catalog import gate CLI |
| `npm run eval:recommend` | Recommend eval harness |

## Clone directory

Examples may say `just-do-it` or `build-my-product-mcp`. Both refer to this repository root. Prefer `just-do-it` in public docs once the remote name is finalized.
