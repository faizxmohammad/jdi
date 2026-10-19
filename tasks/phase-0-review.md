# Phase 0 Independent Review — Just Do It MCP

**Reviewer:** Agent 2 (Independent Reviewer / Challenger)  
**Date:** 2026-10-19  
**Roadmap:** `docs/implementation.md` §6 Phase 0  
**Proposal reviewed:** `tasks/phase-0-proposal.md` (Agent 1 Approach A, docs-first closure)  
**Recommended status:** **PASS** (after High findings remediated during this review)

---

## Independent assessment

Phase 0’s **exit gate** is met with evidence: reproducible `npm ci` + typecheck/test/build, known gaps documented, and no unapproved content imported under `pending_audit` / `metadata_only` / `needs_review` without a recorded decision. Local starter skills are original and recorded as `just-do-it-local` (MIT, `importStatus: imported`).

Do **not** confuse exit-gate PASS with a completed **source license audit**. Most inventory rows still say “Not inspected yet” / `license: unknown`. That is acceptable for the exit gate (“no import without a recorded decision”) but contradicts a casual reading of Phase 0 scope (“Audit … licenses”). Agent 1’s proposal correctly deferred deep LICENSE fetches; the todo checklist should not imply that audit work is finished.

Agent 1’s late docs (CONTRIBUTING, client procedures, local manifest entry) closed real gaps. Tests alone would have been insufficient: a directory-symlink escape in `get_skill` was still open until this review fixed it.

---

## Verification evidence (Agent 2 ran)

| Command | Result |
|---|---|
| `npm run typecheck` | Exit 0 |
| `npm test` | Exit 0 — **19** tests passed (was 18; +1 symlink-dir regression) |
| `npm run build` | Exit 0 |
| Clean tree `npm ci` → typecheck → test → build (`/tmp/jdi-phase0-ci-check`) | Exit 0 (208 packages; lockfile honored) |
| Third-party content under `skills/` | None — five original starter skills; no pending_audit source strings in bodies |
| Skill script execution | None in `src/**` (`exec`/`spawn`/`eval`/`child_process` absent aside from regex `.exec`) |
| Auth | Bearer + `timingSafeEqual`; `/mcp` gated; health unauthenticated |
| `npm audit` | 2 critical + 1 moderate in **Vitest** toolchain (devDependency) |

---

## Findings

### Critical

_(none remaining)_

### High

1. **~~Directory symlink escape in `SkillCatalog.read`~~ — REMEDIATED by Agent 2**  
   - **Was:** `tests/catalog.test.ts` only rejected `SKILL.md` file symlinks. A skill **directory** symlink to an outside tree with `SKILL.md` returned that content via `get_skill` (`VULN_READ "SECRET_OUTSIDE\n"` reproduced against `dist/`). Search correctly skipped such entries (`Dirent.isDirectory()` false for symlinks).  
   - **Fix:** `src/skills/catalog.ts` now rejects symlink directories, then requires `realpath(file)` under `realpath(catalogRoot)`. Regression: `rejects symlink skill directories that escape the catalog`. Re-verified: `FIXED_READ Skill not found: linked-dir`.  
   - **Files:** `src/skills/catalog.ts`, `tests/catalog.test.ts`, note in `docs/known-gaps.md`.

2. **~~Dockerfile not reproducible~~ — REMEDIATED by Agent 2**  
   - **Was:** `Dockerfile` used `RUN npm install` while README/CONTRIBUTING claim lockfile + `npm ci`.  
   - **Fix:** `Dockerfile` → `RUN npm ci`.  
   - **Still open (Medium):** no CI workflow exists despite README checklist “use `npm ci` in CI/builds” marked `[x]`.

### Medium

3. **Source “audit” is inventory, not license review** — `catalog/sources.manifest.json`  
   - 10× `pending_audit`, 4× `metadata_only`, 1× `needs_review`; nearly all `license: unknown`; **zero** `commitOrRelease` pins.  
   - Phase 0 scope asks to audit licenses/paths; exit gate only forbids import without a decision.  
   - **Challenge:** Claiming Phase 0 “audit complete” overstates evidence. Record decisions are fine; call the work **inventory + hold**.  
   - **Non-blocking for exit gate;** required before treating any third-party row as importable (Phase 1).

4. **Placeholder `sourceUrl` for local skills** — `catalog/sources.manifest.json` (`just-do-it-local`)  
   - `https://github.com/local/just-do-it` is a fake GitHub URL (schema-valid, operationally misleading). Known in `knownLimitations` / todo, but still bad provenance.  
   - **Fix:** Use a real repo URL when published, or an explicit non-resolving placeholder (e.g. `https://example.invalid/just-do-it`).

5. **Policy helper is soft and narrow** — `src/catalog/manifest.ts` `assertNoUnauthorizedImports`  
   - Only flags `imported` + `license === "unknown"`. Schema **parses** that combination successfully; enforcement is test-time only, not startup. Does not detect orphan files under `skills/` from pending sources.  
   - **Fix (Phase 1 or late Phase 0):** Fail fast on load if problems.length; optionally refuse `approved_for_import` with `unknown` license.

6. **DevDependency critical advisories** — Vitest / tinypool / `@vitest/mocker`  
   - Documented in `docs/known-gaps.md` after this review. Production image prunes devDeps, but developer/CI machines remain exposed.  
   - **Fix:** Upgrade vitest to a patched range (or pin overrides) and re-run `npm audit` / suite.

7. **README checklist overclaim** — `README.md` security checklist  
   - `[x] … use npm ci in CI/builds` with **no** `.github/workflows` (or equivalent) present.  
   - **Fix:** Uncheck until CI exists, or add a minimal CI job running `npm ci && npm run typecheck && npm test && npm run build`.

### Low

8. **Client E2E still unverified** — `docs/client-compatibility.md`  
   - Procedures exist (good Phase 0 “define”); Status = Unverified. Matches exit gate / Phase 1 delivery better than Phase 0. Not a blocker.

9. **Provisional MIT** — `LICENSE` / `tasks/plan.md`  
   - Documented open governance item. Acceptable for Phase 0 if human does not object.

10. **Unused export** — `src/mcp/server.ts` `newRequestId`  
    - Nit / dead API surface.

---

## Challenges to “Phase 0 done”

| Claim | Challenge |
|---|---|
| Tests pass ⇒ foundation safe | False. Suite green while directory-symlink read escaped the catalog until this review. |
| Sources audited | Manifest is a **hold list**, not a completed license/path audit. |
| Reproducible builds everywhere | Local `npm ci` works; Docker previously did not; CI still absent despite checked box. |
| Contribution + client procedures missing | Agent 1 closed these (`CONTRIBUTING.md`, `docs/client-compatibility.md`) — accepted. |
| No unauthorized imports | True for third-party **content**. Local `imported` + MIT is coherent. Do not treat `pending_audit` rows as cleared for Phase 1 import. |

---

## Required changes before PASS

### Blocking (High/Critical) — addressed in this review

- [x] Reject catalog directory symlinks + realpath containment (`src/skills/catalog.ts` + test)
- [x] Dockerfile uses `npm ci`

### Non-blocking (should track before / during Phase 1)

- [ ] Human or Agent 1: license + path + `commitOrRelease` for first approved sources (do not import while `unknown`)
- [ ] Replace fake `just-do-it-local` `sourceUrl`
- [ ] Upgrade Vitest / clear `npm audit` criticals (or risk-accept in known-gaps with owner)
- [ ] Add CI **or** uncheck README “npm ci in CI/builds”
- [ ] Optionally enforce `assertNoUnauthorizedImports` at server startup
- [ ] Execute `docs/client-compatibility.md` on Claude Code + Cursor (Phase 1 exit leans on this)

---

## Alternatives Agent 1 might have missed

| Topic | Observation |
|---|---|
| Schema location | Zod in `src/catalog/schema.ts` is fine; JSON Schema artifact optional for external tools — not required for Phase 0. |
| Manifest format | Single JSON file + Zod is adequate; could add `commitOrRelease` required when status ≠ `pending_audit`. |
| CONTRIBUTING | Required by Phase 0 “as appropriate”; now present — good. |
| Client procedures | Defining without E2E is OK for Phase 0; claiming verified would not be. |
| Symlink threat model | File-only tests were incomplete; directory + `realpath` should be the baseline. |

---

## Acceptance checklist mapping

| Criterion | Result | Evidence |
|---|---|---|
| Clean checkout installs and builds reproducibly | **Met** | `/tmp/jdi-phase0-ci-check`: `npm ci`, typecheck, 18→19 tests, build; Dockerfile now `npm ci` |
| Known security and compatibility gaps documented | **Met** | `docs/known-gaps.md` (auth, clients, licensing, symlink note, vitest audit) |
| No source imported without recorded license/redistribution decision | **Met** | Third-party ≠ `imported`; `just-do-it-local` MIT + notes; skills/ original |
| Working local baseline | **Met** | HTTP MCP, auth, search/get/version tools, Docker compose hardening |
| Source manifest with licensing/import status | **Met (partial depth)** | Present; licenses mostly unknown by design hold |
| Catalog schema | **Met** | `src/catalog/schema.ts` entry types match §4.2 |
| Initial automated tests | **Met** | 19 tests: auth, rate limit, catalog, schema/manifest, MCP HTTP |
| Documented development setup | **Met** | README + CONTRIBUTING |
| Contribution guidance | **Met** | `CONTRIBUTING.md` |
| Supported client versions + test procedures | **Met (defined, unverified)** | `docs/client-compatibility.md` |
| Deep upstream LICENSE fetch for all inventory URLs | **Skipped** | Agent 1 Approach A; exit gate does not require; track as Phase 1 prep |
| Claude Code / Cursor E2E verification | **Skipped** | Documented unverified; Phase 1 deliverable |

---

## Deliverables scorecard

| Deliverable | Status |
|---|---|
| Working baseline | Yes |
| Source manifest | Yes (inventory + hold) |
| Catalog schema | Yes |
| Automated tests | Yes (strengthened by symlink-dir case) |
| Documented setup | Yes |
| Contribution guidance | Yes (Agent 1) |
| Client version/test procedures | Yes, defined (Agent 1); not executed |

---

## Changes made by Agent 2 (minimal blockers only)

1. `src/skills/catalog.ts` — directory symlink rejection + realpath containment  
2. `tests/catalog.test.ts` — regression for escaping directory symlinks  
3. `Dockerfile` — `npm ci` instead of `npm install`  
4. `docs/known-gaps.md` — symlink behavior + Vitest audit note  

Re-ran `npm run typecheck`, `npm test` (19 passed), `npm run build` after fixes.

---

## Recommended status

**PASS**

Exit gates verified with evidence. High findings discovered during independent review were fixed and re-tested here. Do not start Phase 1 imports until at least one third-party (or original) source has a non-`unknown` license, pinned `commitOrRelease`, and `approved_for_import` — that is Phase 1 work, not a Phase 0 exit failure.

**Do not rubber-stamp future phases on green tests alone.** This review’s primary lesson: path/symlink coverage was incomplete while the suite was green.
