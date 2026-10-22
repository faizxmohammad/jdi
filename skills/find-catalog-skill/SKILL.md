---
name: find-catalog-skill
description: Search this Just Do It catalog before suggesting an install from another registry; calls search_skills, recommend_skills, and plan_capabilities to surface the right skill and its dependencies.
entryType: composite_workflow
category: catalog
tags: discovery, catalog, skill-lookup
triggers: find a skill, is there a skill, install a skill, does this catalog have, what skill, skill for
provides: catalog-search
outputs: Matching catalog skill ids with versions and plan steps, or a clear statement that this catalog has no match and what the next step is.
version: 0.2.0
validationStatus: validated
sourceId: just-do-it-local
---

# Find a catalog skill

## Purpose and scope

Use this skill when the question is whether a skill exists in this catalog for a given task, or when the user is about to install a skill from an external registry.

Activate it when:
- The user asks "is there a skill for X" or "find a skill that does Y".
- The agent is about to suggest installing or importing a skill from an external source.
- A task requires a specific capability and it is unclear whether the catalog covers it.

Do not use this skill when:
- The task is to execute a skill, not discover one.
- The skill id is already known and the task is to read it.

## Prerequisites

1. Know the task the user is trying to accomplish — not just keywords.
2. Access to `search_skills` and `recommend_skills` tools on this server.

## Workflow

### 1. Search the catalog

Call `search_skills` with the task description:
```json
{ "query": "<task description in plain language>" }
```

Call `recommend_skills` with the same query to get ranked results with explanations:
```json
{ "query": "<task description>" }
```

Collect all skill ids returned by either call. Deduplicate.

### 2. Filter and rank the candidates

For each candidate:
- Read its `description`, `category`, `tags`, and `triggers` from the summary.
- Confirm the description matches the task, not just a keyword.
- If two candidates match, prefer the one whose `description` is more specific to the task.

Do not retrieve a skill body until the plan (§3) says `includeBody: true`. Retrieving all bodies wastes context.

### 3. Plan the capability

For any candidate skill that declares `requires` (external tools or capabilities), call `plan_capabilities`:
```json
{ "query": "<task description>", "contextBudgetBytes": 48000 }
```

The plan returns steps including:
- `load_skill` — read this skill body before starting.
- `call_external` — an external capability (Context7, etc.) that the skill needs.
- `check_user_tool` — a CLI that must be present in the user environment.
- `hold_metadata` — summary only; body not needed.
- `clarify` — the query is too ambiguous to plan.

If the plan includes a `check_user_tool` step, relay it to the user before claiming the skill is ready.
If the plan includes a `call_external` step with `proxy: "client_mcp"`, the user must configure the external MCP endpoint.

### 4. Retrieve the body for selected skills

Call `get_skill` only for skills where the plan says `includeBody: true` or the user explicitly asks to read the skill.

### 5. Report the result

Present findings as:
- **Match found**: skill id, version, description, plan steps, any missing prerequisites.
- **Partial match**: skill id and what it does not cover; offer to check for related skills.
- **No match**: explicit statement that the catalog has no skill for this task, and suggest the user author one via `session-skill-review` or the authoring standard.

## Decision rules

- **Catalog-first.** Always search the catalog before suggesting an external install. A skill in the catalog is preferable to an unvetted external skill.
- **Do not invent a skill id.** If no match exists, say so. Do not claim a skill is present when it is not.
- **Do not run external installs.** Do not call `npx skills`, clone a third-party skill repo, or tell the user a skill is installed because a public directory lists it.
- **Plan before body.** Do not load skill bodies until the plan identifies which ones are needed. This prevents context overflow.

## Tool contracts

**`search_skills`**
- Input: `query` — task description.
- Expected output: array of skill summaries.
- On empty: no keyword match; try `recommend_skills`.

**`recommend_skills`**
- Input: `query` — task description. Optional: `context`.
- Expected output: ranked summaries with scores and explanations.
- On empty: catalog has no match.

**`plan_capabilities`**
- Input: `query`, optional `contextBudgetBytes`.
- Expected output: `CapabilityPlan` with `steps[]`, `selectedSkillIds[]`, `status`.
- On `status: "clarify"`: relay the `clarificationPrompt` to the user.

**`get_skill`**
- Input: `skillId`.
- Expected output: skill body, sha256, provenance.
- Only call when plan says `includeBody: true`.

## Verification and acceptance criteria

The workflow is complete when:
1. Both `search_skills` and `recommend_skills` were called.
2. Every candidate was checked against the task description, not just keyword matched.
3. `plan_capabilities` was called for any candidate with `requires`.
4. Missing prerequisites (external tools, CLI) were relayed to the user.
5. The result clearly states: match / partial match / no match.

## Failure handling

- **`recommend_skills` returns empty** → check `search_skills` result. If also empty, the catalog has no match. Offer `session-skill-review`.
- **Plan returns `status: "clarify"`** → relay the clarification prompt to the user. Do not guess.
- **Plan shows a missing CLI (`check_user_tool`)** → tell the user the CLI is not installed. The skill cannot run until it is present.
- **User insists an external skill exists** → acknowledge the claim but do not import or execute it. Point to the authoring standard and the import gate.

## Deliverables

1. Search results: skill ids found (or "no match").
2. Plan steps for the selected skill(s).
3. Missing prerequisites (if any).
4. Recommendation: proceed, address prerequisites first, or draft a new skill.
