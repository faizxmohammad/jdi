# Deployment modes — Just Do It

Roadmap: `docs/implementation.md` §11–§12. Last updated: 2026-10-19 (Phase 7 team foundation).

## Modes

| Mode | Env value | Status | When to use |
|---|---|---|---|
| Local | `JUST_DO_IT_DEPLOYMENT_MODE=local` (default) | Supported | Loopback / single-operator development |
| Private | `private` | Supported | Self-host on a private network or Tailscale with HTTPS |
| Public | `public` | **BLOCKED** — process refuses to start | Not available until OIDC + public controls + privacy/security process |

## Identity model (local / private)

1. Every API token is bound to exactly one `ownerId`.
2. Primary credential: `JUST_DO_IT_TOKEN` + `JUST_DO_IT_OWNER_ID`.
3. Optional additional credentials: `JUST_DO_IT_API_TOKENS_PATH` JSON file:

```json
{
  "credentials": [
    {
      "id": "alice-laptop",
      "token": "replace-with-at-least-32-random-characters",
      "ownerId": "alice",
      "revoked": false
    }
  ]
}
```

Optional Phase 7 fields on each credential: `orgId`, `scopes` (see `docs/team-model.md`, `examples/api-tokens-team.json`). If any credential sets `orgId`, also set `JUST_DO_IT_ORGS_PATH` (`examples/orgs.json`). Omitting `scopes` keeps full access (solo / private backward compatible).

4. Memory tools require tool-arg `ownerId` to **equal** the authenticated binding. Spoofing another owner → tool error.
5. Revocation: set `"revoked": true` (or remove the entry) and reload/restart the process. Rotate by adding a new token, then revoking the old one.
6. Do **not** share one permanent non-revocable token across untrusted users.
7. Team/org foundation is private self-host only — not public multi-tenant SaaS.

## Transport security

- Default bind: `HOST=127.0.0.1` (loopback).
- Docker Compose publishes `127.0.0.1:8080` only.
- Remote access: terminate TLS in front of the app (e.g. Tailscale Serve HTTPS). Do not enable Tailscale Funnel / public internet exposure for memory-bearing deployments.
- Application does not implement its own TLS; operators must provide HTTPS or a private network path for remote clients.

## Public hosting (BLOCKED)

Do **not** set `JUST_DO_IT_DEPLOYMENT_MODE=public`. Startup exits with an error.

Unblocking public mode requires (human / later phase):

- Per-user identity stronger than shared file tokens for internet clients (typically OAuth/OIDC — provider choice TBD)
- Quotas, abuse controls sized for internet traffic, security review
- Documented privacy policy and security reporting process for public beta
- Durable multi-user storage posture (Postgres path when multi-node writes demand it)

Until then: **private / tailnet-only** is the only supported remote posture.

## Related ops

- Secrets hygiene and rotation: `docs/operations.md`, `SECURITY.md`
- Backup / restore / incident: `docs/operations.md`
