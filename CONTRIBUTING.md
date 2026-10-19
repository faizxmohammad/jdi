# Contributing to Just Do It

Thanks for helping improve the skills catalog and MCP server.

## Development setup

1. Use Node.js 22.14+ (see `package.json` `engines`).
2. Copy `.env.example` to `.env`. Set `JUST_DO_IT_TOKEN` to a random secret of at least 32 characters (`openssl rand -hex 32`) and set `JUST_DO_IT_OWNER_ID` to your solo owner id.
3. Install and verify:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Prefer `npm ci` over `npm install` so the committed `package-lock.json` is respected.

The server loads `.env` from the project root automatically (`npm run dev` / `npm start`).

## Project conventions

- TypeScript without semicolons (match existing style).
- Environment variables use the `JUST_DO_IT_*` prefix.
- Catalog content lives under `skills/<id>/SKILL.md`. Treat skill bodies as untrusted instructions.
- Every skill must declare an explicit `sourceId` that exists in `catalog/sources.manifest.json` with a known license and an importable `importStatus`.
- Do not add MCP tools that execute arbitrary shell commands, write outside the catalog, or fetch unreviewed remote Git content.

## Importing skills

MCP tools are **read-only**. Content enters the catalog via Git or the import CLI:

```bash
# Scan catalog + manifest (duplicates, malformed metadata, unauthorized sources)
npm run import-skill -- --diagnose

# Validate a candidate against the import gate (no write)
npm run import-skill -- --source just-do-it-local --from ./path/to/my-skill --check

# Copy an allowed skill into the catalog root
npm run import-skill -- --source just-do-it-local --from ./path/to/my-skill
```

The gate fails closed for blocked statuses, unknown licenses, and approvals without a `commitOrRelease` pin.

## Client skill sync

Installing into Claude Code (`~/.claude/skills`) or Cursor (`~/.cursor/skills`) uses a separate CLI that still honors the import gate:

```bash
npm run just-do-it -- list --target claude-code
npm run just-do-it -- install <skillId> --target cursor --preview
```

Do not add code that executes skill scripts or installs tooling blindly.

## Pull requests

- Keep changes focused; one concern per PR when practical.
- Include or update tests for behavior changes.
- Update `docs/known-gaps.md` if you introduce or close a security/compatibility gap.
- Do not commit `.env`, tokens, or other secrets.
- Use the PR template under `.github/pull_request_template.md`.
- Before release-related PRs, see `docs/release-checklist.md` and keep `package.json` / `src/version.ts` / `CHANGELOG.md` aligned.

## Code of Conduct

Participation is governed by [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Feedback triage

Bugs and features: GitHub issue templates. How maintainers triage: [docs/support.md](./docs/support.md).

## Security

Report vulnerabilities privately per `SECURITY.md`. Do not open public issues for undisclosed vulnerabilities.

## License

Unless noted otherwise, contributions are under the repository `LICENSE` (MIT).
