# Changelog

All notable changes to Just Do It are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Team foundation: file-backed orgs (`JUST_DO_IT_ORGS_PATH`), optional credential `orgId` / `scopes`, per-org private catalog path, governance hooks on `just_do_it_version`
- Docs: `docs/team-model.md`
- Examples: `examples/orgs.json`, `examples/api-tokens-team.json`
- Server loads `.env` from the project root automatically

### Notes

- Public mode / OIDC still refused at startup

## [0.1.0] — 2026-10-19

First versioned changelog for **local** and **private** (self-hosted / Tailscale) modes.

### Added

- Streamable HTTP MCP server (`/mcp`) with bearer-token auth and per-token `ownerId` binding
- Catalog tools: `search_skills`, `get_skill`, `recommend_skills`, `just_do_it_version`
- Project memory tools (SQLite + FTS5) with owner/project isolation
- Local skill sync CLI (`just-do-it`) for Claude Code and Cursor adapters (preview, pin, rollback)
- Import gate CLI for catalog content
- Docker Compose deployment (non-root, loopback publish)
- GitHub Actions CI (typecheck, test, build, production dependency audit)
- Contribution guidelines, Code of Conduct, issue/PR templates, security reporting
- Docs: quick-start, demo walkthrough, deployment modes, operations, client compatibility, data handling, release checklist

### Security

- `JUST_DO_IT_DEPLOYMENT_MODE=public` refuses to start
- Rate limiting and JSON body size limits at the gateway
- Skill content treated as untrusted instructions; MCP tools do not execute skill scripts

### Known limitations

- Claude Code and Cursor HTTP MCP connections are **Unverified** on a clean machine (see `docs/client-compatibility.md`)
- No OAuth/OIDC; not suitable for public internet multi-user hosting
- Formatting/lint tooling not yet in CI; Vitest toolchain has known `npm audit` findings (devDependencies only)
- Catalog `just-do-it-local` `sourceUrl` still uses a placeholder until the public repo URL is finalized

<!-- Replace compare URL when the public repository URL is finalized. -->
[0.1.0]: #
