# Phase 0 — Audit and foundation

**Gate status: PASS** (2026-10-19) — see `tasks/phase-0-completion.md`  
Phase 1 may begin.

- [x] Inspect existing TypeScript starter (MCP HTTP, auth, catalog)
- [x] Establish typecheck + test workflow
- [x] Define catalog schema (Zod) and entry types
- [x] Create source manifest with licensing/import status
- [x] Document known security and compatibility gaps
- [x] Add LICENSE + SECURITY.md
- [x] Enrich search/get with provenance fields
- [x] Add CONTRIBUTING.md
- [x] Define supported clients + manual test procedures (`docs/client-compatibility.md`)
- [x] Record local starter skills in source manifest (`just-do-it-local`)
- [x] Checkpoint: clean install, typecheck, tests, build
- [x] Independent review (`tasks/phase-0-review.md`) — High symlink escape + Dockerfile `npm ci` remediations
- [x] Phase completion report (`tasks/phase-0-completion.md`) — **PASS**

# Phase 1 — Working skill registry MVP

**Gate status: PASS** (2026-10-19) — see `tasks/phase-1-completion.md`  
Phase 2 may begin.

- [x] Proposal (`tasks/phase-1-proposal.md`)
- [x] Import/validation path for first approved original skills (gate + CLI; seed = just-do-it-local)
- [x] Index tags, category, source, version (+ sourceUrl from manifest)
- [x] Duplicate detection + import diagnostics (`--diagnose`)
- [x] Optional category filter on `search_skills` (already present; covered by tests)
- [x] Documented import command (README + CONTRIBUTING)
- [x] Optional version pin on `get_skill`
- [ ] Client connection verification checklist (execute `docs/client-compatibility.md`; mark verified) — **human residual** (Direct HTTP MCP verified for exit gate)
- [x] Import gate requires known license + pin for non-local sources
- [ ] Track: upgrade Vitest / clear `npm audit` criticals (or risk-accept with owner)
- [ ] Track: add CI **or** uncheck README “npm ci in CI/builds”
- [x] Independent review (`tasks/phase-1-review.md`) — Agent 2 **PASS** (High remediations: require `sourceId`, fail-closed manifest, pin non-local `imported`)
- [x] Phase completion report (`tasks/phase-1-completion.md`) — **PASS**

# Phase 2 — Context-aware skill recommendation

**Gate status: PASS** (2026-10-19) — see `tasks/phase-2-completion.md`  
Phase 3 may begin.

- [x] Proposal (`tasks/phase-2-proposal.md`)
- [x] `recommend_skills` MCP tool (metadata/keyword ranker; import-gate filtered)
- [x] Explanations + verified vs inferred evidence; abstain / clarification
- [x] Evaluation set + harness (`eval/recommend-eval.json`, `npm run eval:recommend`)
- [x] Unit tests (`tests/recommend.test.ts`)
- [x] Independent review (`tasks/phase-2-review.md`) — Agent 2 **PASS** (High remediation: vague gate uses task+projectContext tokens)
- [x] Phase completion report (`tasks/phase-2-completion.md`) — **PASS**

# Phase 3 — Persistent user and project memory

**Gate status: PASS** (2026-10-19) — see `tasks/phase-3-completion.md`  
Phase 4 may begin.

- [x] Proposal before coding (`tasks/phase-3-proposal.md`) — SQLite+FTS5 over Postgres/JSONL for solo MVP
- [x] Ownership model + explicit save/get/search memory tools
- [x] Inspect / delete / export MCP tools; supersede correction; conflict indicators
- [x] Retention metadata + privacy-conscious logging (no content bodies)
- [x] Isolation + retrieval + contradiction tests (`tests/memory.test.ts`, MCP smoke in `tests/app.test.ts`)
- [x] Independent review (`tasks/phase-3-review.md`) — Agent 2 **PASS** (High remediation: relevance filter before type boost; Docker `./data` writability docs)
- [x] Phase completion report (`tasks/phase-3-completion.md`) — **PASS**

# Phase 4 — Skill synchronization and external integrations

**Gate status: PASS** (2026-10-19) — see `tasks/phase-4-completion.md`  
Phase 5 may begin.

- [x] Proposal before coding (`tasks/phase-4-proposal.md`)
- [x] Sync CLI: list / install / pin / update / remove / rollback / preview
- [x] Adapters: Claude Code + Cursor (env-overridable roots)
- [x] Path safety, symlink refuse, user-owned overwrite refuse
- [x] Snapshots + rollback; import gate reused on install
- [x] Optional integrations registry (empty by default)
- [x] Tests (`tests/sync.test.ts`)
- [x] Docs (README, CONTRIBUTING, known-gaps, client-compatibility)
- [x] Independent review (`tasks/phase-4-review.md`) — Agent 2 **PASS** (High: rollback user-owned + symlink write-through fixed)
- [x] Phase completion report (`tasks/phase-4-completion.md`) — **PASS**

# Phase 5 — Authentication, public hosting, operational security

**Gate status: PASS (private/local)** (2026-10-19) — see `tasks/phase-5-completion.md`  
Phase 6 may begin. **Do not** unblock `deploymentMode=public` (OIDC + public privacy policy remain human BLOCKED).

- [x] Proposal (`tasks/phase-5-proposal.md`) — per-token owner map; public BLOCKED
- [x] Credential store + bearer auth principal
- [x] Bind memory `ownerId` to authenticated principal (spoof deny)
- [x] Revocation via tokens file; rotation docs
- [x] Rate/body limit config; audit logs without content/tokens
- [x] Refuse `deploymentMode=public` at startup
- [x] Docs: deployment-modes, operations, README, known-gaps, SECURITY
- [x] Negative authz + backup restore tests
- [x] Independent review (`tasks/phase-5-review.md`) — Agent 2 **PASS** (private/local; public/OIDC BLOCKED residual; High: JSON 413 handler + body-limit test)
- [x] Phase completion report (`tasks/phase-5-completion.md`) — **PASS** private/local; public/OIDC BLOCKED residuals
- [ ] **BLOCKED:** OIDC provider choice + public privacy policy before unblocking public mode
- [ ] Postgres migrate when multi-node / public writes demand it

# Phase 6 — Open-source release and adoption

**Gate status: PASS (Approach A OSS readiness)** (2026-10-19) — see `tasks/phase-6-completion.md`  
Phase 7 may begin. **Do not** unblock `deploymentMode=public`. **Do not** invent a public repo URL.

- [x] Proposal (`tasks/phase-6-proposal.md`) — Approach A Minimal OSS hygiene
- [x] GitHub Actions CI (Node 22.14; typecheck/test/build/prod audit)
- [x] CHANGELOG + version single-source (`src/version.ts` + test)
- [x] Contribution/support hygiene (CoC, issue/PR templates, `docs/support.md`)
- [x] Quick-start + demo docs; data-handling; release checklist
- [x] Independent review (`tasks/phase-6-review.md`) — Agent 2 **PASS** (High honesty: CHANGELOG fake URL + known-gaps `contact_links`)
- [x] Phase completion report (`tasks/phase-6-completion.md`) — **PASS** Approach A; human BLOCKED residuals below
- [ ] **BLOCKED:** Public repository URL (replace `example.invalid` / enable real `contact_links` + changelog compare URL)
- [ ] **BLOCKED:** First git commit + push + confirm Actions green; then tag `v0.1.0`
- [ ] **BLOCKED:** Claude Code / Cursor clean-machine verification (keep **Unverified**)
- [ ] **BLOCKED:** External tester outreach (process in `docs/support.md` only)
- [ ] **BLOCKED:** Public mode / OIDC / privacy policy (Phase 5 residual — do not unblock)
- [ ] Track: §13 lint/format/secret-scan/container CI (Medium residual)
- [ ] Track: upgrade Vitest / clear full-tree `npm audit` criticals (or risk-accept)

# Phase 7 — Team features (optional self-host)

**Status: engineering complete** (2026-10-19) — see `tasks/phase-7-completion.md`  
Optional orgs / scopes / private catalog for private self-host. Public mode stays off.

- [x] File-backed orgs + membership; credential `orgId` + scopes; private catalog path
- [x] Docs: `docs/team-model.md`
- [x] Tests green
- [ ] Public repository URL / tag (human)
- [ ] Claude Code / Cursor clean-machine verification (optional)

# Ship private/local OSS (2026-10-19)

**Policy:** [ADR-002](../docs/decisions/ADR-002-oss-self-host.md)

- [x] Load `.env` automatically for `npm run dev` / `npm start`
- [x] README focused on install, run, MCP config
- [ ] Human: publish git remote + set real `just-do-it-local` sourceUrl
- [ ] Human: tag `v0.1.0` when ready (`docs/release-checklist.md`)
- [ ] Ongoing: expand `skills/*` as needed
- [ ] Optional: Claude Code / Cursor clean-machine verify

# Deferred (engineering polish)

- [ ] Embeddings / hybrid semantic memory search
- [ ] Finalize public repository URL for `just-do-it-local` sourceUrl
- [ ] Optionally enforce `assertNoUnauthorizedImports` at server startup
