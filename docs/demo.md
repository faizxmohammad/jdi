# Demo walkthrough — search, recommend, memory, pin

Run against a local server (`npm run dev` or Compose). Replace `TOKEN` and `OWNER` from `.env`.

This demo uses HTTP + the sync CLI. It does **not** prove Claude Code or Cursor UI integration (those remain Unverified until a human runs `docs/client-compatibility.md`).

## 0. Health

```bash
curl -sS http://127.0.0.1:8080/health/live
```

## 1. MCP initialize and list tools

Use any MCP-compatible HTTP client, or rely on the automated suite:

```bash
npm test -- tests/app.test.ts
```

Expect tools including: `search_skills`, `get_skill`, `recommend_skills`, `save_project_context`, `get_project_context`, `just_do_it_version`.

## 2. Version

Call MCP tool `just_do_it_version` (via connected client) or trust the suite. Expect `serverVersion` matching `package.json` (e.g. `0.1.0`) and capabilities including `skill_sync_cli`.

## 3. Search and get skill

Via connected client:

1. `search_skills` with query `spring` (or empty) → summaries **without** full bodies; provenance present.
2. `get_skill` with `skillName: "java-spring-boot"` → content, `sha256`, version.
3. `get_skill` with a path escape like `../escape` → error, no file leak.

## 4. Recommend

Call `recommend_skills` with a task such as:

> Implement a Spring Boot REST service with clear package layout

Expect ranked authorized skills with explanations and verified vs inferred evidence, or an abstain/clarify when evidence is weak. Never invent skills outside the catalog.

Optional eval harness:

```bash
npm run eval:recommend
```

## 5. Project memory (explicit)

With bound owner matching `JUST_DO_IT_OWNER_ID`:

1. `save_project_context` — save a preference or constraint for `projectId` e.g. `demo-app`.
2. `get_project_context` — retrieve for a related task.
3. `search_project_memory` — FTS within owner+project.

Mismatch `ownerId` → deny (authz). Memory is **not** a full conversation log; the agent must submit useful context.

## 6. Skill pinning (CLI, not MCP write)

Catalog writes never go through MCP. Pin/install via CLI:

```bash
npm run just-do-it -- list --target claude-code
npm run just-do-it -- preview install java-spring-boot --target claude-code
npm run just-do-it -- install java-spring-boot --target claude-code
npm run just-do-it -- pin java-spring-boot --version 0.1.0 --target claude-code
```

Use `--target cursor` for Cursor’s skills directory. Prefer `--preview` before mutating a real home directory.

## Honest scope

| Capability | Demo status |
|---|---|
| HTTP MCP auth + tools (automated) | Covered by `npm test` |
| Search / get / recommend / memory | Documented above; suite covers core paths |
| Skill pin via CLI | Documented; adapter FS tests in `tests/sync.test.ts` |
| Claude Code / Cursor UI | **Unverified** on clean machine |
| Public hosted demo | **Not provided** — public mode BLOCKED |
