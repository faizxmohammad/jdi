# Security Policy

## Supported versions

Security fixes are accepted for the latest `main` branch and the most recent tagged release.

## Reporting a vulnerability

Email or open a private security advisory with:

- Affected version or commit
- Impact description
- Reproduction steps if safe to share
- Whether the issue involves skill content, the MCP server, or both

Do not file public issues for undisclosed vulnerabilities.

## Product security rules

- Treat all skill content as untrusted instructions.
- Just Do It must not execute arbitrary scripts, commands, or hooks found in skill content.
- Private endpoints require configured API credentials (`JUST_DO_IT_TOKEN` + `JUST_DO_IT_OWNER_ID`; optional tokens file).
- Each token is bound to one `ownerId`; memory tools reject mismatched owner assertions.
- Do not expose the MCP port to the public internet. `JUST_DO_IT_DEPLOYMENT_MODE=public` is refused until OIDC and public controls exist (see `docs/deployment-modes.md`).
- Secrets must not appear in logs, responses, or the repository. Audit/memory logs omit tokens and content bodies.

See `docs/known-gaps.md` and `docs/operations.md` for current limitations and incident steps.
