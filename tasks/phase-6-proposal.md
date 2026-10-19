# Phase 6 proposal — Open-source release and adoption

Date: 2026-10-19  
Author: Agent 1 (Implementation Lead)  
Roadmap: `docs/implementation.md` §6 Phase 6 + §13 CI checks + §14 Release checklist

## Problem understanding

Phases 0–5 delivered a usable local/private MCP skills catalog. Phase 5 left public/OIDC **BLOCKED**. README still marks CI, changelog, release tags, and related hygiene as open. External developers need a zero-assistance install path, contribution/support process, and versioned release artifacts — without inventing product-market claims or unblocking public mode.

Phase 6 exit gate (roadmap):

1. External developers can install and use the product without direct founder assistance.
2. The project has a documented support and contribution process.
3. Feedback is collected and triaged consistently.

§14 release checklist (align docs + process): CI green, version/changelog, migration/recovery ready, distribution artifacts build, clean install verified, health checks, known limitations, release notes.

## Assumptions

1. “Public repository with a clear license” = MIT `LICENSE` already present; Phase 6 does not require pushing to a remote — prepare repo for OSS publish.
2. Claude Code / Cursor clean-machine MCP UI verification remains **Unverified** — keep matrices honest; do not claim client E2E.
3. Public / OIDC stays **BLOCKED**; do not set `deploymentMode=public`.
4. Phase 7 team commercial features are out of scope.
5. No product-market metrics or “production-ready SaaS” claims.
6. Formatting/lint tooling is absent today; adding ESLint/Prettier from scratch is optional heft. Prefer CI gates that already exist (`typecheck`, `test`, `build`) + dependency audit. Document lint/format as residual if not added.
7. `npm audit` currently fails on Vitest/tinypool (devDependency). Production image prunes devDeps — gate CI on `npm audit --omit=dev`; keep full-tree audit documented / non-blocking.
8. “Recruit external testers” = document how to report feedback and triage (SUPPORT / issue templates), not run a marketing campaign.
9. Demo = documented scripted walkthrough (health + MCP tools / CLI) operators can run locally — not a hosted demo SaaS.

→ Proceed with these unless corrected.

## Approaches considered

### A — Minimal OSS hygiene (preferred)

- GitHub Actions CI: `npm ci` → typecheck → test → build → `npm audit --omit=dev`
- `CHANGELOG.md` for `0.1.0` + version single-source (`src/version.ts` ↔ `package.json`)
- Issue + PR templates; `CODE_OF_CONDUCT.md`; support/feedback triage doc
- Quick-start + demo walkthrough docs; data/telemetry honesty; release checklist mapped to §14
- Update README checklist / known-gaps; keep client matrix Unverified where true

- Pros: Matches exit gate with low surface; honest about gaps; simple to maintain  
- Cons: No semantic-release / npm publish automation; no ESLint/Prettier; no container scan in CI

### B — Heavier release tooling

- changesets / semantic-release, npm publish workflow, ESLint+Prettier, container scan (Trivy), Codecov

- Pros: Closer to §13 “full” CI list  
- Cons: Overkill for first usable OSS artifact; Vitest major bump risk; more failure modes

### C — Docs-only polish

- Pros: Tiny  
- Cons: Fails “CI is green” / versioned releases / contribution process depth

## Preferred approach + rationale

**Approach A.** First usable OSS release bar: install docs, CI quality gate, changelog/version consistency, contribution/support templates, honest matrices and BLOCKED public mode. Approach B deferred. Approach C rejected.

## Out of scope (will not implement)

- Phase 7 team catalogs, billing, RBAC
- Unblocking `deploymentMode=public` / OIDC
- Force-upgrading Vitest to silence audit (breaking; document residual)
- Claiming Claude Code / Cursor verified on clean machines
- Hosted public demo environment
- Automated GitHub release publish / npm registry publish (document manual tag process)

## BLOCKED (human)

1. Public repo URL finalization (`just-do-it-local` still uses `example.invalid` placeholder — known-gaps).
2. Clean-machine Claude Code / Cursor manual verification.
3. Public mode / OIDC / privacy policy (Phase 5 residual).
4. Actual external tester recruitment outreach (process only here).

## Implementation plan

1. Write this proposal
2. Add `.github/workflows/ci.yml` (typecheck, test, build, prod audit)
3. Add `CHANGELOG.md`, `src/version.ts`, wire MCP/catalog server version
4. Issue/PR templates + `CODE_OF_CONDUCT.md`
5. Docs: quick-start, demo, data-handling, support, release-checklist; README / known-gaps updates
6. Validate typecheck / test / build; YAML sanity-check CI workflow
7. Lead report (**no PASS claim**)

## Success evidence (self-check before Agent 2)

- Fresh-clone path documented: `cp .env.example` → `npm ci` → typecheck/test/build/dev or Compose
- CI workflow valid YAML; local equivalent commands pass
- CHANGELOG has `0.1.0`; serverVersion matches `package.json`
- Contribution + CoC + issue/PR templates present
- Support/feedback triage documented
- Client matrix still Unverified where appropriate; public mode still BLOCKED
- No Phase 7 features
