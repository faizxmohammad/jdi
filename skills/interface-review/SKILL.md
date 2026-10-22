---
name: interface-review
description: Review or shape a user interface with one design system, a stated thesis, and mandatory accessibility checks. Produces findings against a specific source, not a design philosophy.
entryType: instruction_skill
category: interface
tags: interface, accessibility, typography, design-system, ux
triggers: review ui, review my ui, landing page, design system, accessibility audit, wcag, contrast check, keyboard navigation
provides: interface-review
outputs: A short thesis, the single design source used, and concrete findings with file references and actionable recommendations.
version: 0.2.0
validationStatus: validated
sourceId: just-do-it-local
---

# Interface review

## Purpose and scope

Use this skill when the task is to review or build a user interface: an existing screen, a new landing page, a component, or a flow.

Activate it when:
- The user asks for a UI review, accessibility audit, or design feedback.
- The user asks to implement a visual direction for a new screen.
- The user references a design system or brand guide.

Do not activate it when:
- The task is a pure data or API change with no rendered output.
- The task asks to "design" without a project context — in that case, establish the project context first.

## Prerequisites

1. **Identify the design source.** The project must use exactly one primary design source. Common sources:
   - An existing design document, brand guide, or component library already in the project.
   - A framework design system (Tailwind, Radix, shadcn/ui, Material, Ant Design).
   - A published external guideline (e.g. the Vercel web interface guidelines).
   - If none of these exists, write a short design thesis (§2) before writing code and get approval.
2. **Scope the review.** Name the specific screen, component, or flow. A review of "the whole app" is not actionable.
3. **Know the target device and browser context.** Desktop, mobile, or both. Breakpoints in use.

If the design source is ambiguous or the scope is undefined, ask before proceeding.

## Workflow

### 1. Establish the design thesis (for new work only)

If the project has no existing design source, write a thesis before touching code. The thesis answers:
- **Subject**: what kind of product/page is this? (e.g. a SaaS dashboard, a marketing landing page)
- **Type treatment**: which font family and scale? Why?
- **Color**: background, primary, accent, danger — and their contrast ratios.
- **Motion**: is there any? If yes, what does each animation communicate?
- **Components**: which component library, if any? Why?

Present the thesis and wait for approval when the user has asked for directional approval before code.

### 2. Use the design source consistently

- Read the design document, component library API, or external guideline before writing any code.
- Apply tokens from the design system (spacing, radius, shadow, color) rather than one-off values.
- Do not merge two design systems into one screen. If the project already uses shadcn/ui, do not add Ant Design components.
- If the project uses Tailwind, use only the project's configured theme tokens. Do not add arbitrary values (`w-[37px]`) without a documented reason.
- **For Vercel web interface guidelines specifically**: fetch the current text from `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md` and review against that live fetch. Do not reproduce cached or embedded content in this repository.

### 3. Check naming and labels

- Every control must have a visible label or an accessible name (via `aria-label`, `aria-labelledby`, or `title` on SVG).
- Action labels must state what happens ("Save changes", not "OK").
- Error messages must state what went wrong and how to fix it ("Email is required", not "Error").
- Truncated text must be accessible in full via tooltip or expanded state.

### 4. Check keyboard accessibility

Walk the critical path using keyboard only:
- Tab order follows the visual reading order.
- All interactive elements are reachable by Tab and operable by Enter/Space.
- Focus is visible on every focusable element (not suppressed with `outline: none` without a replacement).
- Modal dialogs trap focus inside and return focus to the trigger on close.
- Custom components (dropdowns, date pickers, carousels) implement the correct ARIA pattern.

Report each gap as: "[component/line]: [what is missing]. WCAG 2.1 criterion: [number and level]."

### 5. Check color contrast

- Text on background: WCAG 2.1 AA requires ≥ 4.5:1 for normal text, ≥ 3:1 for large text (≥ 18pt / 14pt bold).
- Interactive element boundaries (buttons, inputs): ≥ 3:1 contrast against adjacent background.
- Do not use color alone to convey information (e.g. status, error state).

Verify with the design system's documented tokens. If the tokens are not documented, compute the ratio from the hex values.

### 6. Check motion

- Respect `prefers-reduced-motion`. Wrap animations in `@media (prefers-reduced-motion: no-preference)` or the equivalent JS check.
- Each animation must have a purpose (it communicates a state change or directs attention). Remove purely decorative animation that has no semantic function.
- Avoid flashing content (WCAG 2.3.1: no more than three flashes per second).

### 7. Write the findings

Format each finding:
```
Component/location: <file:line or component name>
Criterion: <what rule or standard applies>
Finding: <what is missing or incorrect>
Recommendation: <what to change>
```

Group findings by category: naming/labels, keyboard, contrast, motion, design consistency.

## Decision rules

- **One design source per screen.** If two sources conflict, use the one the project already uses. Document the conflict.
- **Approval before directional code.** If the project has no design source and the thesis represents a real direction decision, wait for the user to approve the thesis before implementing.
- **Accessibility is not optional.** A finding with a WCAG AA impact is always reported, even if it is in existing code not touched by the current task.
- **No design-token database in this repo.** Do not embed a copy of any design system's tokens in a file here. Reference them by URL or import from the installed package.
- **Motion explains; it does not decorate.** Challenge any animation that does not communicate a state change.

## Tool contracts

No MCP tools are required. For external guidelines, fetch the live URL (file read or browser fetch by the user). Do not use a cached copy embedded in this repository.

## Verification and acceptance criteria

A review is complete when:
1. The design source is named and cited.
2. Every finding includes a file or component reference.
3. Contrast ratios are stated for color findings.
4. WCAG criterion numbers are cited for accessibility findings.
5. Recommendations are specific (not "improve contrast" — "change `text-gray-400` to `text-gray-700`").

## Failure handling

- **No existing design source** → write a thesis and request approval before code. Do not invent a design direction without presenting it first.
- **Two conflicting design systems in the project** → flag the conflict as a finding. Do not resolve it unilaterally.
- **Cannot compute contrast ratio** → state the colors and ask the user to check with a tool (browser DevTools, Colour Contrast Analyser). Do not guess.
- **External guideline URL is unavailable** → state that the fetch failed and proceed with the project's existing design source. Do not use a remembered version.

## Deliverables

1. Design source used (cited by name and file or URL).
2. Thesis (for new work only, before code).
3. Structured findings per category.
4. Specific recommendations with file references.
