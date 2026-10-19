# Team model foundation

Last updated: 2026-10-19 (authorization remediation).

Thin multi-owner / org foundation for **private** self-host. Not hosted SaaS. Phase status: engineering preview — see `tasks/phase-gate-status.md`.

## Authorization model (canonical)

| Mechanism | Controls tool access? |
|---|---|
| Token `scopes[]` | **Yes** — authoritative allow-list for tools |
| Org **role** (`owner` \| `admin` \| `member` \| `viewer`) | **Yes** — **hard ceiling** on which scopes a credential may hold |
| Role alone without matching scopes | No — operators must still set (or omit) scopes |

### Rules

1. Credential with `orgId` must resolve to an org membership.  
2. If `scopes` are set, every scope must be ⊆ `scopesForRole(role)`. Otherwise **startup fails closed**.  
3. If `scopes` are omitted on an **org-bound** credential, effective scopes = role ceiling (viewer ≠ admin).  
4. Solo credentials **without** `orgId` that omit scopes keep full access (backward compatible).  
5. Memory tools still require `ownerId` tool arg to match the authenticated principal.

### Role ceilings

| Role | Max scopes |
|---|---|
| `owner` / `admin` | all (`catalog:*`, `memory:*`, `admin`) |
| `member` | `catalog:read`, `memory:read`, `memory:write` |
| `viewer` | `catalog:read`, `memory:read` |

Example: a `viewer` credential with `"scopes": ["admin"]` **will not load**.

## What exists

| Concept | Mechanism |
|---|---|
| Org / team | JSON via `JUST_DO_IT_ORGS_PATH` (`examples/orgs.json`) |
| Token → org | Optional `orgId` on credentials (`JUST_DO_IT_API_TOKENS_PATH`) |
| Private team catalog | Optional org `catalogPath` |
| Governance hints | `approvedChannels`, etc. on `just_do_it_version` (hints only) |

## Operator setup

1. Copy `examples/orgs.json` and `examples/api-tokens-team.json`.  
2. Replace tokens (`openssl rand -hex 32`).  
3. Ensure each credential’s `scopes` ⊆ role ceiling for that member.  
4. Set `JUST_DO_IT_ORGS_PATH` and `JUST_DO_IT_API_TOKENS_PATH`, restart.

## Tests

- Unit: `tests/org.test.ts` (ceilings, escalation fail-closed, org defaults)  
- HTTP: `tests/scopes-mcp.test.ts` (scope denial, cross-owner memory isolation)  
