---
name: session-skill-review
description: Turn a repeated correction or gap into a skill draft for a human to accept or reject; calls draft_skill_candidate and returns persisted=false.
entryType: composite_workflow
category: catalog
tags: skill-draft, correction, authoring
triggers: skill observation, improve this skill, task observer, draft a skill, create a skill, observed pattern
provides: skill-draft
outputs: A SKILL.md draft with persisted=false, or a reason the draft was rejected by the validation rules.
version: 0.2.0
validationStatus: validated
sourceId: just-do-it-local
---

# Session skill review

## Purpose and scope

Use this skill when:
- The user corrects the agent and the correction could prevent the same mistake in the future.
- The same workaround appears twice in the same session.
- The user explicitly asks to create or improve a skill.

Do not run this skill before every tool call or speculatively. It should be triggered by an observable pattern or a direct user request — not preemptively.

Do not run this skill when:
- Only one instance of a behavior has been observed.
- The correction is project-specific and would not generalize.
- The existing catalog already has a skill that covers the behavior.

## Prerequisites

1. **A concrete correction or repeated pattern.** State it in one sentence before calling the tool.
2. **Confirmed that no existing skill already covers it.** Call `search_skills` with the proposed skill name and description. If a match exists, propose updating the existing skill instead.

## Workflow

### 1. State the correction

Write one sentence: "The agent did X when it should have done Y, in the context of Z."

Example: "The agent generated code for a library API without checking the installed version, leading to an outdated signature."

This sentence becomes the input justification for the draft.

### 2. Check the existing catalog

Call `search_skills` with a query matching the proposed behavior. If the result includes a skill that covers the same ground:
- Do not draft a duplicate.
- Propose editing the existing skill's `description`, `triggers`, or workflow steps instead.
- Show the user the existing skill id and what to add to it.

### 3. Draft the skill candidate

Call `draft_skill_candidate` with:
- `name`: a lowercase slug matching a proposed `skills/<name>` directory.
- `description`: what the skill does, in one sentence.
- `entryType`: the most appropriate type (see the authoring standard).
- `category`: the most appropriate category.
- `tags`: 3–6 specific tokens.
- `triggers`: 1–5 phrases the user would use when the skill should activate.
- `body`: the skill workflow — see §4.

The tool returns `{ markdown, persisted: false, validationStatus: "needs_review" }` or a rejection with `issues`.

If the tool returns `issues`, fix the inputs and retry once. If it fails again, report the rejection with the issues list.

### 4. Write the draft body

The draft body must follow the authoring standard. Minimum required sections:
- **Purpose and scope** — one paragraph. What problem does the skill solve? When not to use it?
- **Workflow** — numbered steps. No vague verbs.
- **Deliverables** — what a successful run produces.

Do not:
- Copy text from another project's skill files.
- Include instructions that would instruct the agent to perform unsafe actions.
- Claim the skill is `validated` — the draft always has `validationStatus: needs_review`.

### 5. Present the draft to the user

Show the returned markdown. State clearly:
- `persisted: false` — the draft is not in the live catalog.
- The user must accept it and run the import gate before it becomes active.
- The draft has `validationStatus: needs_review`.

Do not write to the `skills/` directory yourself. The user runs the import gate.

### 6. Offer an edit

If the user modifies the draft, call `draft_skill_candidate` again with the updated inputs. Each call returns a fresh draft with `persisted: false`.

## Decision rules

- **Draft, do not deploy.** The agent produces a draft. A human accepts it. This boundary must not be crossed.
- **Original content only.** Do not copy another project's skill text into the draft. Write an original instruction.
- **One draft per pattern.** Do not create five drafts for variants of the same behavior. Write one general skill and note the variant as an example.
- **Needs-review is not validated.** A draft with `validationStatus: needs_review` is not served by `recommend_skills` until the import gate accepts it.

## Tool contracts

**`search_skills`**
- Input: the proposed skill description as a query.
- Expected output: matching skill summaries.
- On empty: no existing skill covers this ground; proceed to drafting.

**`draft_skill_candidate`**
- Input: name, description, entryType, category, tags, triggers, body.
- Expected output: `{ markdown: string, persisted: false, validationStatus: "needs_review" }` or `{ status: "invalid_input", issues: [] }`.
- On rejection: fix inputs and retry once. If rejected again, report the issues to the user.

## Verification and acceptance criteria

The workflow is complete when:
1. The catalog search confirmed no existing skill duplicates the draft.
2. The draft tool returned `persisted: false`.
3. The draft body has Purpose, Workflow, and Deliverables sections.
4. The draft was shown to the user with the explicit `persisted: false` status.

## Failure handling

- **`draft_skill_candidate` rejects the input** → report the issues list verbatim. Ask the user to clarify the inputs. Do not silently retry with guessed values.
- **Existing skill already covers the pattern** → do not draft a duplicate. Show the existing skill and propose specific additions.
- **Pattern is project-specific** → note this. A project-specific behavior may be better as a comment in the relevant file or a project-level rule.
- **User wants to write to `skills/` directly** → the user may do that. Explain the import gate process.

## Deliverables

1. Catalog search results (existing skills checked).
2. Draft markdown with `validationStatus: needs_review` and `persisted: false`.
3. Clear statement that the draft is not live until the import gate accepts it.
