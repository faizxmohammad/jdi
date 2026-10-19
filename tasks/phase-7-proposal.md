# Phase 7 proposal — Team foundation

## Goal

Add a thin multi-owner / org foundation so private self-host operators can issue per-member tokens without breaking the solo workflow.

## Approach

File-backed orgs + optional token `orgId` / `scopes` + optional private catalog path. Document in `docs/team-model.md`. Keep public hosting refused.

## Out of scope

- Hosted SaaS, billing, OIDC
- Changing the solo local/private defaults
