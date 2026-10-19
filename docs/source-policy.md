# Source / catalog policy

**Last updated:** 2026-10-19  
**Related:** `catalog/sources.manifest.json`, `docs/decisions/ADR-002-oss-self-host.md`

## Decision (authoritative)

Just Do It ships a **first-party catalog** under `skills/`. The only approved manifest source is:

| id | path | license | importStatus | commit/release |
|---|---|---|---|---|
| `just-do-it-local` | `skills/` | MIT (repo `LICENSE`) | `imported` | Git revision of this repository (pin when publishing tags) |

External skill repositories from early brainstorm inventories are **not** mandatory installs, are **not** mirrored into this repo, and are **not** listed in the shipping manifest.

Early roadmap phrases (“audit the eight requested sources”, growing inventory lists) described **candidate research**, not an approved import backlog. Candidates without a completed license + quality + security decision remain **out of catalog**.

## Why this is not a 17-row shipping manifest

Lead review asked for a full audit table for every inventory URL. Re-publishing that inventory here would:

1. Imply those sources are part of the product  
2. Contradict ADR-002 (self-host OSS with first-party catalog content)  
3. Create pressure to import unreviewed material  

Instead:

- Shipping truth = `catalog/sources.manifest.json` (currently one source)  
- Any future external source must be added **only** after recording: URL, path, immutable commit/release, license, attribution, dependencies, entry type, security review, `importStatus`, and rationale  
- Until then, `importStatus` stays blocked (`pending_audit` / `rejected` / etc.) and the import CLI fails closed  

## Shipped skills (all `sourceId: just-do-it-local`)

| Skill id | Notes |
|---|---|
| `java-spring-boot` | Instruction skill |
| `nodejs-architecture` | Instruction skill |
| `database-migrations` | Instruction skill |
| `regression-testing` | Instruction skill |
| `hotel-booking-debugger` | Instruction skill |

## Operator rule

Do not copy third-party skill trees into `skills/` without updating the manifest and passing `npm run import-skill -- --check`.
