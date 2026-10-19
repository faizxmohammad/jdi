# Phase 1 proposal — Working skill registry MVP

Date: 2026-10-19  
Author: Agent 1 (Implementation Lead)  
Roadmap: `docs/implementation.md` §6 Phase 1 + §4.1/4.2 + §8

## Problem understanding

Phase 1 exit gate needs:

1. Clean client setup can discover and retrieve the expected skill
2. Result includes provenance and a version identifier
3. Search does not require loading the entire catalog into the agent's context

Existing baseline already has `search_skills` / `get_skill` / `just_do_it_version`, local `skills/` originals, Zod schemas, and a source manifest. Gaps vs Phase 1 scope:

| Requirement | Status | Gap |
|---|---|---|
| Search + exact retrieval | Partial | Works; provenance omits `sourceUrl`; no optional version pin on `get_skill` |
| Index name/description/tags/category/source/version | Partial | Indexed in memory per request; source hard-coded to `just-do-it-local` |
| Content digests + immutable version ids | Partial | `sha256` on read; version from frontmatter/`VERSION` |
| Validate metadata and paths | Partial | Soft skip on search; no structured diagnostics |
| Duplicate detection + import diagnostics | Missing | No scanner/CLI |
| Import CLI or documented import command | Missing | Only Claude sync script |
| Load from local or Git-backed sources | Partial | Local tree only; Git = repo checkout |
| Licensing gate on import | Soft | `assertNoUnauthorizedImports` test-only; no import path |
| Client verification | Documented, unverified | Procedures exist; E2E still human/CI |

**Licensing hard constraint (Phase 0 review):** Do not import manifest rows while `pending_audit` / `metadata_only` / `needs_review` / `license: unknown`. Only import when `approved_for_import` (with known license + pin) or work with `just-do-it-local` / original content. Prefer pipeline that enforces the gate; seed with local skills. Document BLOCKED for third-party rather than importing.

## Assumptions

1. Phase 1 success = pipeline + local seed + MCP contract enrichment; not catalog content in-tree.
2. “Git-backed” for MVP = skills live in this Git repo (or a local path that mirrors that layout), not a network Git fetch CLI.
3. “Search does not load entire catalog into agent context” = MCP tools return summaries only (already true); server may read files to build an index.
4. Client E2E against Claude Code / Cursor may remain Unverified if no interactive clients available; document evidence + remaining BLOCKED for human verification.
5. No Phase 2+ tools (`recommend_skills`, memory, OAuth, Postgres).

→ Correct me now or proceed with these.

## Approaches considered

### A — Local validate/import CLI + diagnostics + catalog provenance from manifest (preferred)

Add:

1. **Import policy** — `canImportSource(entry)` allows only `just-do-it-local` with `imported`, or `approved_for_import` with `license !== "unknown"` and `commitOrRelease` set. Everything else fails closed.
2. **Diagnostics** — scan `skills/` + manifest: malformed frontmatter, path/symlink issues, unauthorized orphans, duplicate ids/names/content digests. Emit structured report (JSON-friendly).
3. **CLI** — `npm run import-skill -- …` that validates a candidate skill directory, enforces the gate, detects duplicates, and for allowed sources copies into `skills/<id>/` (or `--check` dry-run). Seed path: validate existing local originals in place (`--source just-do-it-local --catalog ./skills --check`).
4. **Catalog enhancements** — resolve provenance (`sourceUrl`, license, attribution, `commitOrRelease`) from manifest by `sourceId`; include `sourceUrl` in MCP search/get payloads; optional `version` on `get_skill` (mismatch → structured error); keep MCP read-only (no write tools).
5. **Tests + docs** — unit tests for policy/diagnostics/import/catalog; README/CONTRIBUTING import command; note third-party BLOCKED.

- Pros: Matches exit gate; enforces Phase 0 license lesson; smallest surface; no network
- Cons: No remote Git clone; third-party still blocked until human audits

### B — Generated summary index file (`catalog/index.json`)

Import writes a committed JSON index; `search_skills` reads only the index (never skill bodies).

- Pros: Stronger “search without loading bodies”; faster at scale
- Cons: Two sources of truth unless carefully regenerated; more Phase 1 churn for five local skills

### C — Network Git fetch for `approved_for_import` sources

Clone/pin upstream at `commitOrRelease` during import.

- Pros: True multi-source registry
- Cons: Zero sources currently `approved_for_import`; violates “do not import pending”; network + security surface; Phase 1 creep

## Preferred approach + rationale

**Approach A.** Delivers searchable/retrievable approved skills with provenance + digests, import diagnostics, and a documented CLI that refuses unauthorized sources. Approach B is a later optimization. Approach C is BLOCKED until a human marks a source `approved_for_import` with known license and pin.

## Out of scope (will not implement)

- `recommend_skills`, memory tools, OAuth, Postgres
- Importing any `pending_audit` / `metadata_only` / `needs_review` / unknown-license source
- Network Git clone
- Skill script execution
- Claiming Claude Code / Cursor verified without a real client run

## Implementation plan

1. Write this proposal
2. Add `src/catalog/importPolicy.ts` + tighten `assertNoUnauthorizedImports`
3. Add `src/catalog/diagnostics.ts` (duplicates, malformed, unauthorized)
4. Add `src/cli/import-skill.ts` + `npm run import-skill`
5. Enhance `SkillCatalog` + MCP `get_skill` version pin + manifest-backed provenance/`sourceUrl`
6. Tests; README/CONTRIBUTING/known-gaps/todo updates
7. Run typecheck, test, build; record evidence
8. Phase 1 lead report (no PASS claim)

## Success evidence (self-check before Agent 2)

- `npm run import-skill -- --check` exits 0 on local seed; reports duplicates/problems clearly when injected in tests
- Unauthorized source import attempt fails with diagnostic (not silent copy)
- `search_skills` returns summaries with `provenance.sourceUrl` + version; bodies absent
- `get_skill` returns content + `sha256` + provenance + version
- Third-party manifest rows unchanged (not `imported`)
