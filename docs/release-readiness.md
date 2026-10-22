# Release readiness (bounded next work)

**Status:** Engineering verification **PASS** (provisional). Phase 6 adoption **PARTIAL — blocked from closure**. Phase 7 **FROZEN**.

This is not product redesign. Track only verification and release hygiene.

## Accepted limitations (do not claim otherwise)

| Item | Status |
|---|---|
| Claude Code / Cursor clean-machine UI | **UNVERIFIED** — `docs/client-compatibility.md` |
| Docker live UID / persistence | Run on a host with Docker (checklist below) |
| Public repo URL / tag / remote CI | Human decisions |
| Lint/format + container image scan in CI | **Accepted gap** until added — CI today: typecheck, test, build, prod audit (`.github/workflows/ci.yml`). Documented in `docs/known-gaps.md`. |
| Recommend eval sample size | Expanded beyond original 13; still not proof of broad generalization — `docs/recommend-eval.md` |

## Checklist

### 1. Gitignore hygiene

Unnecessary / secret / generated paths are ignored (`.gitignore`).  
Do **not** ignore `tasks/` evidence docs. Keep `.env.example` tracked.

### 2. Docker host checks

**Evidence recorded 2026-10-19 (this workstation):**

| Check | Result |
|---|---|
| `docker compose run --rm --entrypoint id just-do-it` | `uid=100(app) gid=101(app)` |
| `/health/live` + `/health/ready` | HTTP 200, `{"status":"UP"}` |
| Write under `/data/memory` | `WRITE_OK` (existing `./data` mount) |
| File-copy backup → restore → `list_project_memory` | `SAVE_OK` / `RESTORE_OK` on ephemeral volume (isolated dir; not production `data/`) |
| Unowned host dir (e.g. `/tmp/...` mode 700 as laptop user) | Container fails: `unable to open database file` — confirms ownership requirement |

Normal install still prefers `chown 100:101` + `chmod 700` on `./data` (not world-writable). Paths: host `./data/` ↔ `/data/memory/memory.sqlite` (`docs/operations.md`).

### 3. Health-check flake

**Cause (most likely):** `app.listen(0)` then immediate `fetch` before the socket reported `listening` (startup race). Not a missing route — `/health/live` is registered in `src/app.ts`.

**Mitigation shipped:** `tests/helpers/listen.ts` waits for `listening` on `127.0.0.1`; used by `tests/app.test.ts`, `tests/auth.test.ts`, `tests/rateLimit.test.ts`.

**Re-check:** full `npm test` 104/104; health test stressed 5× — all passed.

### 4. Client UI (human)

Follow `docs/client-compatibility.md` on clean machines. Keep matrix **Unverified** until recorded.

### 5. Public repository / tag (human)

Public repo: https://github.com/faizxmohammad/jdi — clone URL and `sourceUrl` updated.  
Remote CI on Node 24 is **green**. Still open: first release tag (`v0.1.0`) when ready (`docs/release-checklist.md`); Claude Code / Cursor clean-machine UI remains **Unverified**.

### 6. CI expansion (optional later)

Add ESLint/Prettier and image scanning, **or** keep the accepted gap explicit in `docs/known-gaps.md` (current choice).

## Bottom line

Accept engineering PASS as provisional. Do **not** approve production/public-release claims until Phase 6 human items above advance. No Phase 7 feature work.
