# Phase 5 Lead Report — Authentication, public hosting, and operational security

**Role:** Agent 1 (Implementation Lead)  
**Date:** 2026-10-19  
**Repo:** `/Users/mohammedfaiz/Desktop/build-my-product-mcp`  
**Roadmap:** `docs/implementation.md` §6 Phase 5 + §11 + §12  
**Proposal:** `tasks/phase-5-proposal.md`  
**Status:** Implementation complete for Agent 2 review — **does not claim PASS**

---

## 1. Phase and objective

**Phase:** Phase 5 — Authentication, public hosting, and operational security  

**Objective:** Safely expose a multi-user hosted service (roadmap). This pass targets **local + private self-host** readiness and closes the Phase 3 High residual (shared bearer can assert any `ownerId`). Full public internet multi-user is **not** claimed.

**Exit gate (roadmap — for coordinator after review):**

1. Unauthorized access tests pass  
2. Cross-user and cross-project access tests pass  
3. Credentials can be revoked  
4. Rate limits and resource limits are verified  
5. Backup restoration and incident procedures are tested  
6. Public beta has a documented privacy policy and security reporting process  

---

## 2. Understanding and approach

### Chosen design: Approach A — per-token owner map + public BLOCKED

| Layer | Choice |
|---|---|
| Primary credential | `JUST_DO_IT_TOKEN` + required `JUST_DO_IT_OWNER_ID` |
| Multi-user self-host | Optional `JUST_DO_IT_API_TOKENS_PATH` JSON (`id`, `token`, `ownerId`, `revoked`) |
| Memory authz | Tool-arg `ownerId` must equal authenticated binding; mismatch → deny |
| Modes | `local` / `private` allowed; `public` refuses to start |
| Transport | Document HTTPS / Tailscale private; no app-level TLS |
| Limits | Configurable rate limit + JSON body limit (existing controls retained) |
| Audit | `audit` events without tokens/content; memory logs unchanged (no bodies) |
| Backup / incident | `docs/operations.md` + SQLite copy/restore smoke test |
| OIDC / public SaaS | **Not built** — BLOCKED pending human provider + privacy/process |

### Debate (token map vs OIDC vs docs-only)

| Option | Closes Phase 3 spoofing? | Public beta exit? | Verdict |
|---|---|---|---|
| **Per-token owner map** | Yes | No (honest BLOCKED) | **Chosen** |
| OAuth/OIDC | Yes (with mapping) | Partial | Deferred — needs human credentials/provider |
| Docs-only private | No | No | Rejected |

### Assumptions (as in proposal)

1. Private self-host with bound tokens is the intended deployment for this gate.  
2. Public mode must fail closed, not “almost ready.”  
3. SQLite remains OK; Postgres deferred until multi-node/public writes demand it.  
4. No invented OIDC client secrets.

---

## 3. What was implemented

| Deliverable | Status | Notes |
|---|---|---|
| Credential store | Done | `src/security/credentials.ts` — multi-token verify, revocation |
| Auth middleware | Done | `createRequireBearerAuth` attaches `AuthPrincipal` |
| Owner binding | Done | `bindOwnerId` / MCP memory tools enforce match |
| Deployment mode guard | Done | `public` → `createApp` throw + `assertDeploymentModeAllowed` exit |
| Config | Done | owner id, tokens path, rate/body limits, audit_ok flag |
| Audit logger | Done | auth_fail / auth_revoked / owner_mismatch (no secrets) |
| Docs | Done | `docs/deployment-modes.md`, `docs/operations.md`, README, known-gaps, SECURITY, CONTRIBUTING, `.env.example` |
| Example tokens file | Done | `secrets/api-tokens.example.json` |
| Compose | Done | requires `JUST_DO_IT_OWNER_ID`; default mode `private` |
| Negative authz tests | Done | spoof owner, revoked token, cross-token isolation |
| Backup restore smoke | Done | `tests/backup-restore.test.ts` |

**Not implemented (correctly out of scope / BLOCKED):**

- OAuth/OIDC provider integration  
- Claiming public hosting ready  
- Privacy policy for public beta (process/legal)  
- Postgres migration  
- Phase 6+ polish  

---

## 4. Validation evidence (Agent 1)

Commands run:

```bash
npm run typecheck   # pass
npm test            # 13 files / 84 tests pass
npm run build       # pass
```

Notable tests:

- `tests/credentials.test.ts` — bind/revoke/spoof unit  
- `tests/auth.test.ts` — invalid / revoked / valid + bound owner  
- `tests/app.test.ts` — MCP spoof deny; multi-token isolation; public mode refuse  
- `tests/backup-restore.test.ts` — SQLite copy reopen  
- Existing `tests/rateLimit.test.ts` still covers limiter  

---

## 5. Exit-gate self-assessment (honest — not PASS)

| Gate item | Agent 1 view |
|---|---|
| Unauthorized access tests | **Met for private model** — invalid/revoked → 401 |
| Cross-user / cross-project | **Met for bound tokens** — spoof owner denied; cross-token search empty; store still scopes project |
| Credentials revoked | **Met for tokens file** — `revoked: true` → 401 (restart/reload required to pick up file edits) |
| Rate / resource limits | **Met at self-host level** — configurable; in-memory limiter documented as non-WAF |
| Backup restore + incident | **Met as docs + smoke test** — not a managed backup product |
| Public beta privacy policy + security reporting | **Not met for public beta** — `SECURITY.md` reporting exists; public privacy policy + OIDC **BLOCKED** |

**Public-hosting rule (§11):** Satisfied by refusing `public` mode and documenting private/tailnet-only.

---

## 6. Residuals / risks for Agent 2

1. **High (intentional BLOCKED):** Public mode / OIDC / public privacy policy — human decision required before unblocking.  
2. **Medium:** Tokens file changes require process restart (no hot reload).  
3. **Medium:** In-memory rate limiter is per-process; not durable across replicas.  
4. **Medium:** Postgres still deferred — fine for private SQLite self-host; revisit for multi-node.  
5. **Low:** `auth_ok` logging off by default (noise); failures always audited when logger attached.  
6. **Low:** Primary env token cannot be revoked without rotating env + restart (file entries support `revoked`).  

---

## 7. Questions for Agent 2 / coordinator

1. Accept Approach A (bound API tokens + public BLOCKED) as Phase 5 gate for private self-host?  
2. Confirm OIDC provider choice remains human BLOCKED (do not invent credentials)?  
3. Is “public privacy policy” explicitly out of this private-mode PASS path?  

---

## 8. Files touched (summary)

**New:** `src/security/credentials.ts`, `src/security/audit.ts`, `docs/deployment-modes.md`, `docs/operations.md`, `secrets/api-tokens.example.json`, `tests/credentials.test.ts`, `tests/backup-restore.test.ts`, `tasks/phase-5-proposal.md`, `tasks/phase-5-lead-report.md`

**Updated:** `src/security/auth.ts`, `src/config.ts`, `src/app.ts`, `src/index.ts`, `src/mcp/server.ts`, `src/memory/authorize.ts`, `src/memory/types.ts`, tests (auth/app), README, known-gaps, SECURITY, CONTRIBUTING, `.env.example`, `docker-compose.yml`, `package.json`, `vitest.config.ts`, `.gitignore`, `tasks/todo.md`

---

## 9. Handoff

Agent 2: independent review against proposal + exit gate.  
Coordinator: do **not** record Phase 5 PASS until review; do **not** start Phase 6+ unless tiny dependency.  
Lead does **not** claim PASS.
