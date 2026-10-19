# Phase 5 Independent Review — Just Do It MCP

**Reviewer:** Agent 2 (Independent Reviewer / Challenger)  
**Date:** 2026-10-19  
**Roadmap:** `docs/implementation.md` §6 Phase 5 + §11 + §12  
**Proposal reviewed:** `tasks/phase-5-proposal.md` (Approach A — per-token owner map + public BLOCKED)  
**Lead report:** `tasks/phase-5-lead-report.md` (not treated as PASS)  
**Phase 3 residual:** Shared-token `ownerId` spoofing (`tasks/phase-3-review.md` High #2)  
**Recommended status:** **PASS** (private/local gate) with **public/OIDC human BLOCKED** residuals

---

## Independent assessment

Phase 5’s **private self-host exit** is met with Agent-2-run evidence. Approach A is the right call: bind each API token to one `ownerId`, deny tool-arg spoofing, keep `JUST_DO_IT_DEPLOYMENT_MODE=public` fail-closed, and **do not** invent OIDC credentials.

1. **Phase 3 spoofing residual closed** — MCP `search_project_memory` with bound token + foreign `ownerId` → `isError` / principal mismatch (not empty list). Unit `bindOwnerId` denies mismatch. Mutation invert of `!==` → tests fail (then restored).
2. **Authn/authz** — Bearer → `AuthPrincipal`; all six memory tools call `resolveOwner` / `bindOwnerId` before store ops. Revoked token → HTTP 401. Cross-token alice/bob isolation → bob search `[]`.
3. **Rate / payload / audit** — Rate limiter still covered; body limit now returns JSON `{ error: "payload_too_large" }` with regression test (Agent 2 High fix). Audit events omit tokens/content (unit-asserted).
4. **No false public-ready claim** — Docs + startup refuse `public`; lead report honest. SECURITY.md reporting exists; public privacy policy + OIDC remain human BLOCKED.
5. **Import gate untouched** — `importPolicy` / sync gate tests still green; no Phase 6/7 product creep.

Full roadmap item “public beta privacy policy” is **not** met — correctly scoped out. That is a **BLOCKED residual for public mode**, not a FAIL of Approach A private gate.

---

## Challenges to Agent 1 proposal / lead report

| Claim / assumption | Challenge | Outcome |
|---|---|---|
| Approach A closes spoofing without OIDC | Correct for self-host multi-user with operator-managed tokens. | **Accepted** |
| Public mode BLOCKED at startup | Required by §11; matches “no false public-ready.” | **Accepted** — escalate OIDC/provider to human |
| “Rate / body limit still enforced (tests)” | Rate limit tested; **body limit was not** before review. Default Express 413 was HTML. | **Challenged → High** — Agent 2 added JSON 413 handler + test |
| Credentials revoked = tokens file `revoked: true` | Requires process restart; primary env token has no `revoked` flag. | **Accepted** with Medium residual (documented) |
| Backup restore “tested” | Smoke copy/reopen only — not managed backup / DR drill. | **Accepted** for private MVP + `docs/operations.md` |
| Public beta privacy policy out of PASS path | Roadmap exit lists it; Approach A scopes private. | **Accepted** — private **PASS**; public policy **BLOCKED** (human) |
| SQLite OK; Postgres deferred | Matches private self-host; known-gaps still implied Phase 5 Postgres. | **Accepted** — Agent 2 clarified known-gaps wording |
| Phase 6/7 creep | OSS polish / team SaaS | **None observed** beyond auth/ops docs |
| Lead “does not claim PASS” | Correct. | **Accepted** |

Answers to lead-report questions (§7):

1. **Yes** — Accept Approach A as Phase 5 gate for private/local self-host.  
2. **Yes** — OIDC provider choice stays human BLOCKED; do not invent client secrets.  
3. **Yes** — Public privacy policy is out of the private-mode PASS path; required before unblocking `public`.

---

## Verification evidence (Agent 2 ran)

| Command / probe | Result |
|---|---|
| `npm run typecheck` | Exit **0** |
| `npm test` | Exit **0** — **13** files, **86** tests (was 84; +2 Agent 2: body limit, audit shape) |
| `npm run build` | Exit **0** |
| `npm run eval:recommend` | Exit **0** — `passSelfCheck: true` (Phase 2 regression) |
| Unauth MCP | HTTP **401** |
| Spoof `ownerId` under valid token | Tool `isError` + mismatch message |
| Alice save → Bob search same project name | `records: []` |
| Revoked token | HTTP **401** |
| `deploymentMode: "public"` | `createApp` throws |
| Body over `jsonBodyLimit` | HTTP **413** + `{ error: "payload_too_large" }` |
| Mutation: invert `bindOwnerId` compare | Spoof/isolation tests **fail** (restored) |
| Import gate | `tests/importPolicy.test.ts` still **9** pass |
| Phase 6/7 surfaces | No OIDC client, billing, team RBAC, public repo publish automation |

---

## Findings

### Critical

_(none)_

### High

1. **~~Payload limit claimed verified but untested; 413 returned HTML~~ — REMEDIATED by Agent 2**  
   - **Was:** Proposal success evidence claimed body-limit tests; only rate-limit unit existed. Oversized bodies returned Express HTML error pages (dev stack / prod “Payload Too Large”).  
   - **Fix:** Terminal error middleware maps `entity.too.large` → `413` JSON `{ error: "payload_too_large" }`; `tests/app.test.ts` regression.  
   - **Files:** `src/app.ts`, `tests/app.test.ts`.

### Medium

1. **Token file changes require restart** — no hot reload of `JUST_DO_IT_API_TOKENS_PATH`. Documented; acceptable for private self-host.  
2. **Primary env token not file-revocable** — rotation = change env + restart. File entries support `revoked`.  
3. **In-memory rate limiter** — per-process, not multi-replica/WAF. Documented.  
4. **Postgres still deferred** — fine for private SQLite; revisit before public/multi-node.  
5. **`projectId` remains client-chosen within an owner** — no per-project ACL. OK for private; not internet multi-tenant IAM.  
6. **Backup smoke ≠ full restore drill** — ops doc + copy/reopen only.

### Low

1. **`requireBoundMemoryAuthz` unused** — MCP uses `bindOwnerId` directly; helper is fine for future consolidation.  
2. **`just_do_it_version` exposes `credentialId` + `boundOwnerId`** — only to authenticated caller; acceptable.  
3. **MCP spoof coverage** — search/save paths covered; list/delete/export rely on shared `resolveOwner` (unit bind covers logic).  
4. **`unsafeGetByIdOnly` still on store** — not on MCP path; keep out of production call paths.  
5. **Audit `auth_ok` off by default** — correct noise choice.

### BLOCKED (human — do not invent)

1. **OIDC / public hosting provider** — choose Auth0 / Cognito / Keycloak / GitHub OAuth (etc.) + client config before unblocking `public`.  
2. **Public beta privacy policy** — legal/process ownership beyond `SECURITY.md` vulnerability reporting.  
3. **Unblocking `JUST_DO_IT_DEPLOYMENT_MODE=public`** — after the above + security review + quotas sized for internet.

---

## Exit gate checklist

| Criterion | Status | Evidence |
|---|---|---|
| Unauthorized access tests pass | **Met** (private model) | Missing/invalid/revoked → 401 |
| Cross-user / cross-project access tests | **Met** (bound tokens + store scope) | Spoof deny; alice/bob MCP; Phase 3 project isolation tests still green |
| Credentials can be revoked | **Met** (file + restart) | `revoked: true` → 401; documented |
| Rate limits and resource limits verified | **Met** (after Agent 2 body-limit fix) | `rateLimit.test.ts` + 413 JSON test |
| Backup restoration and incident procedures tested | **Met** (smoke + docs) | `backup-restore.test.ts` + `docs/operations.md` |
| Public beta privacy policy + security reporting | **Partial** | SECURITY reporting **yes**; public privacy policy **BLOCKED** |
| §11 public-hosting rule | **Met** | `public` refused; private/tailnet docs |
| §12 no shared non-revocable multi-user token | **Met** for private multi-user | Per-token owner map; public blocked |
| No false public-ready claim | **Met** | Docs + lead + startup |
| No import-gate weakening / Phase 6 creep | **Met** | Tests + scope check |

---

## Required Agent 1 changes

_(none remaining after Agent 2 High remediations)_

Coordinator: record Phase 5 **PASS** for private/local when ready. Keep public/OIDC items **BLOCKED**. Do **not** start Phase 6 until coordinator gate. Do **not** set `JUST_DO_IT_DEPLOYMENT_MODE=public`.

---

## What's done well

- Honest Approach A vs OIDC vs docs-only debate; public fail-closed instead of “almost ready.”  
- Closes Phase 3 High residual at the tool boundary (deny spoof, not silent empty).  
- Constant-time multi-token scan; duplicate id/token rejected at store build.  
- Audit + memory log contracts avoid tokens and content bodies.  
- Compose still binds publish to `127.0.0.1`; requires `JUST_DO_IT_OWNER_ID`.  
- Lead report correctly does **not** claim PASS and lists human BLOCKED items.

---

## Final recommendation

**PASS**

Phase 5 private/local authentication and operational hardening may proceed to coordinator completion. Public internet multi-user remains **BLOCKED** pending human OIDC/provider choice and privacy/security process. Do **not** start Phase 6 until the coordinator records the Phase 5 gate.
