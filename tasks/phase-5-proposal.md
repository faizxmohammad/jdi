# Phase 5 proposal — Authentication, public hosting, and operational security

Date: 2026-10-19  
Author: Agent 1 (Implementation Lead)  
Roadmap: `docs/implementation.md` §6 Phase 5 + §11 + §12

## Problem understanding

Phase 3 left a **High residual**: shared `JUST_DO_IT_TOKEN` proves gateway access only; any token holder can assert any `ownerId`. Data-layer filters isolate rows by client-asserted ids, but that is not cryptographic multi-user identity.

Phase 5 exit gate (roadmap) wants:

1. Unauthorized access tests pass
2. Cross-user and cross-project access tests pass
3. Credentials can be revoked
4. Rate limits and resource limits verified
5. Backup restoration and incident procedures tested
6. Public beta has documented privacy policy and security reporting process

§11 public-hosting rule: do not expose a public endpoint with private context storage until authz, quotas, isolation, logging controls, and deletion are tested.

§12 modes: local (loopback), self-hosted private (configurable credentials, HTTPS or private network, rotation/revocation), hosted public (per-user credentials, scopes, rate limits; OAuth/OIDC only when justified). Do not use one permanent shared non-revocable token as the production multi-user model.

## Assumptions

1. Phase 5 for this pass targets **local + private self-host** readiness and closes the Phase 3 owner spoofing residual. Full **public internet multi-user SaaS** is **not** claimed.
2. Simplest sufficient identity for self-host multi-user: **API token → ownerId map** (env primary token + optional tokens file). OAuth/OIDC deferred until a human picks a provider and public mode is explicitly unblocked.
3. Memory tools keep `ownerId` in the schema for client clarity, but the server **binds** it to the authenticated principal (mismatch → deny).
4. `JUST_DO_IT_DEPLOYMENT_MODE=public` refuses to start (fail closed) until public controls + privacy/security process docs exist — documented as BLOCKED, not silently “almost public.”
5. SQLite remains OK for private self-host; Postgres migrate stays deferred until multi-node / public writes demand it (not required to close spoofing).
6. Existing in-memory rate limiter + JSON body limit stay; make limits configurable and cover with tests. Not a WAF substitute — documented.
7. Audit logs: auth success/fail/revoke path events + existing memory ops; **never** tokens or memory content bodies.
8. Backup/incident: documented procedures + a restore smoke test (copy SQLite → open → read). No managed cloud backup product.

→ Proceed with these unless corrected.

## Approaches considered

### A — Per-token owner map + private-only public BLOCKED (preferred)

- Primary: `JUST_DO_IT_TOKEN` + required `JUST_DO_IT_OWNER_ID`
- Optional: `JUST_DO_IT_API_TOKENS_PATH` JSON credentials (`token`, `ownerId`, `id`, `revoked`)
- Auth middleware attaches `AuthPrincipal`; MCP memory tools reject mismatched `ownerId`
- Revocation: `revoked: true` or remove entry; rotation: add new token, revoke old
- Modes: `local` | `private` allowed; `public` exits at startup
- Docs: when public allowed vs private/tailnet-only; HTTPS; secrets; ops/backup/incident; security reporting stub

- Pros: Closes High residual with minimal surface; matches §12 self-hosted private; no invented OIDC
- Cons: Not SSO; operators manage token files; not suitable for anonymous public internet

### B — OAuth/OIDC for hosted public mode

- Pros: Real end-user identity for public beta
- Cons: Needs provider choice, redirect URIs, client secrets, session model — **human decision / credentials**. Overkill for solo self-host. Marks Phase 5 public exit incomplete without privacy policy + security review.

### C — Document private-only only; keep client-asserted ownerId

- Pros: Tiny doc change
- Cons: Does **not** close Phase 3 High residual; fails “credentials revoked” / unauthorized spoof tests

## Preferred approach + rationale

**Approach A.** Closes shared-token owner spoofing for self-hosted multi-user (or forced single-owner solo). Public mode stays **BLOCKED** at process start with explicit docs — satisfies §11 without claiming public beta. Approach B recorded as BLOCKED option for later. Approach C rejected.

## Debate summary (token map vs OIDC vs private-only docs)

| Option | Closes spoofing? | Public beta exit? | Complexity |
|---|---|---|---|
| Per-token owner map | Yes | No (honest BLOCKED) | Low |
| OIDC | Yes (with mapping) | Partial (still need policy/review) | High + human creds |
| Docs-only private | No | No | Trivial |

## Out of scope (will not implement)

- Full cloud SaaS, billing, org RBAC (Phase 7+)
- OIDC provider integration (BLOCKED — needs human provider choice)
- Postgres migration (unless tiny dependency; not required here)
- Phase 6 open-source polish beyond docs touched for auth/hosting
- Claiming public mode ready

## BLOCKED (human decision)

1. **Public hosting / OIDC:** Choose provider (e.g. Auth0, Cognito, Keycloak, GitHub OAuth) and supply client config before unblocking `deploymentMode=public`.
2. **Public beta privacy policy + security reporting process:** Legal/process ownership; stub security-reporting doc can exist, but roadmap “public beta privacy policy” remains human.

## Implementation plan

1. Write this proposal
2. Credential store + auth principal middleware (multi-token constant-time verify, revocation)
3. Config: deployment mode, owner id, tokens path, rate/body limits; refuse `public` at startup
4. Bind principal `ownerId` on all memory MCP tools; update trust-model docs in code comments
5. Audit logger (auth events, no secrets/content)
6. Negative authz tests (spoof owner, revoked token, cross-user); update app MCP tests for bound owner
7. Docs: deployment modes, ops backup/incident, README, known-gaps, .env.example; security reporting stub
8. Backup restore smoke test
9. typecheck / test / build; lead report (**no PASS claim**)

## Success evidence (self-check before Agent 2)

- Token A bound to owner-a cannot read/write owner-b memory (tool-level deny)
- Revoked token → 401
- Cross-project isolation still holds within an owner
- Rate limit / body limit still enforced (tests)
- `public` mode does not start
- Restore procedure documented + automated smoke
- Docs state private/tailnet-only vs public BLOCKED
