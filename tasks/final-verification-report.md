# Final evidence-based verification report

**Date (UTC):** 2026-10-19T08:24:56Z  
**Environment:** Node v24.2.0, npm 11.3.0  
**Verifier:** automated agent run against working tree  
**Scope:** engineering verification only — no feature work; Phase 7 remains frozen  

---

## Decisions

| Gate | Decision | Rationale |
|---|---|---|
| **Engineering verification** | **PASS** (with documented residuals) | `npm run typecheck`, `npm test` (104/104), `npm run build`, recommend eval self-check all exited 0 on a re-run. Auth/role/isolation/manifest/naming checks independently confirmed via targeted tests + file inspection. |
| **Phase 6 adoption gate** | **PARTIAL / BLOCKED for close** | No git commit/tag/public URL/client UI verification. Human release checklist incomplete. Do **not** reopen Phase 7. |

Residuals that do **not** flip engineering to FAIL, but block calling this a release-ready pin:

1. **No git commit** — `git rev-parse HEAD` fails; branch `main` has **0 commits**. Cannot record a commit SHA. Critical-file fingerprint below substitutes until first commit.  
2. **Docker daemon unavailable** in this environment (`permission denied` on docker.sock) — live container UID / persistence smoke **not executed**. Compose config + Dockerfile + file-copy backup test **were** inspected/run.  
3. **One intermittent flake observed** on first full `npm test` (`tests/app.test.ts` health `/health/live` expected 200 got 404). Immediate re-run of that file and a second full suite: **PASS**. Treat as residual flake risk, not a standing defect with failing evidence on final pass.

Claude Code / Cursor UI: remain **UNVERIFIED** (docs only).

---

## 1. Commands on final working tree

### Identity of the tree

```text
git status -sb
## No commits yet on main
(all project files untracked)

git rev-parse HEAD
→ fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree

Commit SHA: UNAVAILABLE (0 commits)

Critical-file SHA256 aggregate (listed files only):
dd636f9202cfa3fbc7ae7b6601710d4d2a7fe45cc27a13b6ca2918bf087a608c
```

Files included in aggregate: `package.json`, `package-lock.json`, `catalog/sources.manifest.json`, `src/security/credentials.ts`, `src/org/scopes.ts`, `src/app.ts`, `src/mcp/server.ts`, `src/config.ts`, `docker-compose.yml`, `Dockerfile`, `eval/recommend-eval.json`, `eval/recommend-eval-results.json`, five `skills/*/SKILL.md`.

Package `engines` require Node `>=22.14.0`.

### Results (final successful pass)

| Command | Exit | Evidence summary |
|---|---|---|
| `npm run typecheck` | **0** | `tsc --noEmit` clean |
| `npm test` | **0** | **16** files, **104** tests passed, ~2.1s |
| `npm run build` | **0** | `tsc -p tsconfig.json` clean |
| `node --import tsx src/cli/eval-recommend.ts` | **0** | `exitGate.passSelfCheck: true`, wrote `eval/recommend-eval-results.json` |

Targeted re-run (auth/isolation):  

`npx vitest run tests/org.test.ts tests/credentials.test.ts tests/scopes-mcp.test.ts tests/auth.test.ts tests/memory.test.ts tests/backup-restore.test.ts` → **6 files, 35 tests, exit 0**.

---

## 2. Role ceiling, defaults, token validation, isolation

### Role ceiling + default scopes (executed)

| Check | Evidence |
|---|---|
| Viewer cannot hold `admin` | `tests/org.test.ts` → `fails closed when viewer credential requests admin scopes` **PASS**; impl `src/security/credentials.ts` (`scopesWithinRole` at store build) |
| Clamp strips illegal scopes | `tests/org.test.ts` → `viewer ceiling rejects admin/write scopes` **PASS**; `src/org/scopes.ts` `clampScopesToRole` |
| Org-bound omitted scopes → role max (not admin) | `tests/org.test.ts` → `org-bound omitted scopes default to role ceiling not admin` **PASS** (viewer → `catalog:read`,`memory:read`) |
| Solo omitted scopes → full access | `tests/org.test.ts` → `omitted scopes grant full access` **PASS** (no `orgId`) |
| Non-member / unknown org fail closed | `tests/org.test.ts` → `fails closed when owner is not an org member`, `fails closed on unknown orgId` **PASS** |

### Token validation (executed)

| Check | Evidence |
|---|---|
| Unauthenticated MCP rejected | `tests/app.test.ts` → `rejects unauthenticated MCP requests` **PASS** (in full suite) |
| Bearer auth + audit | `tests/auth.test.ts` **3/3 PASS**; `tests/credentials.test.ts` **6/6 PASS** (incl. `owner_mismatch` audit) |
| Public mode refused | `tests/app.test.ts` → `refuses to construct an app in public deployment mode` **PASS** |

### Owner/project isolation + cross-tenant denial (executed)

| Check | Evidence |
|---|---|
| Memory owner/project isolation | `tests/memory.test.ts` **8/8 PASS** (search isolation, supersede, retention) |
| Per-token owners + revoked token | `tests/app.test.ts` → `isolates memory across per-token owners and blocks revoked tokens` **PASS** |
| Scope denial over HTTP MCP | `tests/scopes-mcp.test.ts` **3/3 PASS** |

---

## 3. Skill manifest — first-party only

### Shipping manifest (inspected)

`catalog/sources.manifest.json` contains **exactly one** source:

| id | importStatus | license | sourcePath |
|---|---|---|---|
| `just-do-it-local` | `imported` | MIT | `skills/` |

### Shipped skills (inspected)

All five `SKILL.md` files declare `sourceId: just-do-it-local`:

- `skills/java-spring-boot/SKILL.md`  
- `skills/nodejs-architecture/SKILL.md`  
- `skills/database-migrations/SKILL.md`  
- `skills/regression-testing/SKILL.md`  
- `skills/hotel-booking-debugger/SKILL.md`  

No other directories under `skills/` (plus `VERSION`).

### Candidates cannot be mistaken for approved deps

| Check | Evidence |
|---|---|
| Policy | `docs/source-policy.md` — inventories are not mandatory installs |
| Gate blocks unapproved statuses | `tests/importPolicy.test.ts` **9/9 PASS** (`pending_audit`, `metadata_only`, unknown license, non-local `imported` without pin) |
| Repo search | No SkillDock / external inventory dependency entries in `package.json` dependencies |

---

## 4. Docker permissions, memory paths, backup/restore

### Config evidence (inspected; daemon smoke **not** run)

| Item | File evidence |
|---|---|
| Non-root user | `Dockerfile`: `adduser -S app`, `USER app` |
| Memory path (Compose) | `docker-compose.yml`: `JUST_DO_IT_MEMORY_PATH=/data/memory/memory.sqlite`; volume `./data:/data/memory` |
| Catalog path (Compose) | `JUST_DO_IT_CATALOG_PATH=/data/skills`; `./skills:/data/skills:ro` |
| Loopback publish | `ports: "127.0.0.1:8080:8080"` |
| Default local memory | `src/config.ts` / `.env.example`: `./data/memory.sqlite` |
| Docs reject `chmod 777` as normal install | `docs/quick-start.md`, `README.md`, `docs/operations.md` |
| Ops path table | `docs/operations.md` — Node vs Compose paths |

`docker compose config` resolved paths as above (token values redacted from this report).  
`docker run … id app` → **DOCKER_RUN_UNAVAILABLE** (permission denied on docker.sock). **Live UID confirmation and container persistence smoke: NOT EXECUTED.**

### Backup/restore (executed)

`tests/backup-restore.test.ts` → `restores records from a copied sqlite file` **PASS** (copy SQLite file, reopen, read decision). Matches operator procedure in `docs/operations.md` (file copy), not a live Compose volume test.

---

## 5. Product naming reconciliation

| Surface | Observed value |
|---|---|
| `package.json` `name` | `just-do-it` |
| npm scripts | `just-do-it`, `import-skill`, `eval:recommend`, … |
| MCP server name | `just-do-it` (`src/mcp/server.ts`) |
| Version tool | `just_do_it_version` (registered) |
| Env prefix | `JUST_DO_IT_*` only in `.env.example` / `src/config.ts` |
| Compose service | `just-do-it` |
| Docs title | Just Do It |

### SkillDock rename?

Repo-wide search for `SkillDock` / `skilldock`: **no matches**.  
Legacy alias `skills_hub_version` appears only as a **forbidden** name in `docs/mcp-tool-contract.md` / remediation notes — not as a registered tool.

**Recorded finding:** Product identity in-tree is **Just Do It / `just-do-it`**. An intentional rename **from SkillDock is not evidenced in this repository**. Working directory name remains `build-my-product-mcp` (clone path), which is a residual naming inconsistency for humans but not an MCP/env conflict.

---

## 6. Recommendation evaluation

### Dataset

- File: `eval/recommend-eval.json`  
- **Case count: 13**  
- Catalog under test (from results): `database-migrations`, `hotel-booking-debugger`, `java-spring-boot`, `nodejs-architecture`, `regression-testing`

### Metrics (from this run → `eval/recommend-eval-results.json`)

| Metric | Baseline `keyword_token_equal` | Recommend `metadata_weighted_v1` |
|---|---|---|
| Hit@3 | 1.000 (10/10) | 1.000 (10/10) — held |
| Precision@3 | 0.758 (8.333…/11) | **0.950** (9.5/10) — improved |
| Abstain accuracy | 0.667 (2/3) | **1.000** (3/3) — improved |
| Fabrication count | **0** | **0** |
| `exitGate.passSelfCheck` | — | **true** |
| `improvedOverBaseline` | — | **true** |

### Precise definition of “0 fabrication”

From `eval/recommend-eval.json` `metricNotes` and `src/cli/eval-recommend.ts`:

> For each recommended skill id in a case’s result, if that id is **not** present in the authorized catalog id set (`catalogIds` from `SkillCatalog.search`), increment `fabricationCount`.  
> `noFabrication` requires `fabricationCount === 0` for **both** baseline and recommend modes.

It does **not** mean “never recommends a wrong skill among catalog skills” (that is precision/hit). It means **no invented skill ids outside the catalog**.

---

## 7. Client UI compatibility

| Client | Status | Evidence |
|---|---|---|
| Claude Code UI | **UNVERIFIED** | `docs/client-compatibility.md` matrix; no clean-machine run in this pass |
| Cursor UI | **UNVERIFIED** | same |
| HTTP MCP (automated) | Verified by suite | `tests/app.test.ts`, `tests/scopes-mcp.test.ts` |
| Sync CLI adapters | Verified by temp-HOME tests | `tests/sync.test.ts` |

---

## 8. Phase 6 / Phase 7 posture

| Item | Status |
|---|---|
| Phase 6 eng hygiene | Met by in-repo docs/CI artifacts (not re-proven via remote Actions here) |
| Phase 6 adoption close | **BLOCKED / PARTIAL** — no commit, no tag, no public URL, UI Unverified, lint/image-scan CI gaps remain (`tasks/phase-gate-status.md`) |
| Phase 7 feature work | **FROZEN** — no features added this pass |

---

## Summary for approver

- **Engineering verification: PASS** on automated typecheck/test/build/eval + targeted auth/isolation/manifest checks, with residuals (no commit SHA; Docker live smoke not run; one observed flake).  
- **Phase 6 adoption gate: PARTIAL — do not close.** Complete human release items first.  
- **Phase 7: frozen.**  

Next human steps before release approval: create initial commit (record SHA), tag when ready, confirm Docker UID/`chown` on a machine with Docker, run Claude Code/Cursor clean-machine checklist, keep UI **UNVERIFIED** until then.
