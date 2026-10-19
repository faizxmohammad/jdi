# Support and feedback triage

Phase 6 adoption process. Maintainers use this to respond consistently without founder back-channels.

## Channels

| Channel | Use for |
|---|---|
| GitHub Issues (bug / feature templates) | Defects, concrete enhancements |
| Pull requests | Code/docs contributions (`CONTRIBUTING.md`) |
| `SECURITY.md` private report | Undisclosed vulnerabilities |
| Code of Conduct reports | Community conduct (`CODE_OF_CONDUCT.md`) |

Do not use public issues for secrets, tokens, or undisclosed vulns.

## Triage labels (suggested)

- `bug` — broken behavior with reproduce steps
- `enhancement` — feature request
- `docs` — documentation only
- `good first issue` — small onboarding tasks
- `blocked` — waiting on human decision (e.g. public/OIDC, client verification)
- `wontfix` / close — out of scope (e.g. public mode without stronger auth)

## Response cadence (aspirational)

- Security reports: acknowledge as soon as practical; follow `docs/operations.md` incident steps.
- Bugs: confirm reproduce → accept / ask for info / close as duplicate.
- Features: prefer small, reversible changes; public hosting stays out of scope until stronger auth exists.

## What we will not claim while triaging

- That Claude Code or Cursor is verified until `docs/client-compatibility.md` status changes.
- That public hosting works (`deploymentMode=public` stays refused).

## Contributing

Development setup, import gate, and PR expectations: `CONTRIBUTING.md`.
Release process: `docs/release-checklist.md`.
