---
name: repo-orientation
description: Trace a repository from entry points to the behavior in question, citing file evidence before inferring; use before any non-trivial edit to an unfamiliar codebase.
entryType: instruction_skill
category: analysis
tags: repository, entry-points, evidence, codebase, tracing
triggers: reverse engineer, codebase map, knowledge graph, entry points, entry point, understand repo, trace code, trace the call, call path, understand how, how does this work
provides: repo-map
outputs: Entry points, the path from input to the behavior in question, and a split between cited facts and inferences.
version: 0.2.0
validationStatus: validated
sourceId: just-do-it-local
---

# Repository orientation

## Purpose and scope

Use this skill before any non-trivial edit to a codebase you have not fully read. Its goal is to trace the code path from a known entry point to the specific behavior the task concerns, collecting cited evidence along the way.

Activate it when:
- The task involves changing code in a repository you have not worked in this session.
- The request says "understand", "explain", "trace", "map", or "how does X work".
- You are about to make a change that touches more than two files and you have not read the entry points.

Do not activate it when:
- The task is a known local edit (the file and the change are already specified).
- You have already read the relevant entry points in this session.
- The repository contains only one or two files.

## Prerequisites

1. Know the specific behavior the task concerns (the function, endpoint, event, or error you are tracing to).
2. Know the programming language and framework — read `package.json`, `pom.xml`, `Cargo.toml`, `pyproject.toml`, or the equivalent before anything else.
3. Know whether a `graphify-out/graph.json` file exists (search the repository root). If it does, query the graph first.

## Workflow

### 1. Find the entry point

An entry point is where execution begins for the request or behavior in question. Common entry points by project type:

| Project type | Entry points |
|---|---|
| HTTP service | Route registration file, main file that starts the server |
| CLI tool | `main()`, command handler |
| Library | Exported public API in `index.ts`, `lib.rs`, `__init__.py` |
| Event-driven | Event handler registration, message consumer |
| Scheduled job | Job class or cron function |

Read the entry point file first. Follow only the code path relevant to the task.

### 2. Follow the call path

From the entry point, trace to the behavior:
- Read the file for the next function/class on the path.
- At each step, record: file, line range, what the code does, what it delegates to.
- Stop reading a branch when it is clearly not on the path to the behavior.
- Do not load the entire module tree into context — follow only the relevant path.

Depth limit: stop at the third layer of abstraction below the entry point unless the behavior lives deeper. At that point, name the abstraction and ask the user whether to continue.

### 3. Use the graph if available

If `graphify-out/graph.json` exists:
- Open it and search for the module or function name by keyword.
- Read the edges for the relevant node to find its callers and callees.
- This avoids loading files not on the call path.

Just Do It does not install Graphify and does not build a graph. Do not attempt to generate one.

### 4. Separate cited facts from inferences

For every claim in your orientation report, mark it as one of:
- **[READ: file:line]** — you read this directly from the source.
- **[INFERRED from X]** — you concluded this from evidence at location X.
- **[UNKNOWN]** — you do not have enough evidence; name what file would resolve it.

Do not present inferences as facts. If a claim is labeled UNKNOWN, do not act on it.

### 5. Scope discipline

Orientation answers: "How does X work?" It does not fix X, refactor X, or add features to X. At the end of orientation, you should have:
- One sentence: "The behavior starts at [entry point] and reaches [specific function/line] via [path]."
- A list of cited files and line ranges.
- A list of inferences and their evidence.
- Any gaps (UNKNOWN items) that would require reading more files to resolve.

## Scope restrictions

- **Binary and compiled artefacts** — do not decompile, disassemble, or unpack. State that the source is not available.
- **Mobile apps (APK, IPA), firmware, containers** — require tools the user runs in their environment. Name the tool (apktool, jadx, objdump, binwalk) and stop. Do not reconstruct logic from headers or manifest files.
- **Debugger or dynamic analysis** — orientation is static analysis only. Do not attach a debugger from this server.
- **Exploit or bypass reconstruction** — if the path leads to a security-sensitive boundary, describe what you found and stop. Do not produce bypass steps, attack scripts, or payloads.

## Decision rules

- **Read before inferring.** If you have not read the file, do not claim what it does.
- **Follow one path at a time.** Do not branch into multiple paths simultaneously. Finish the primary path, then address secondary paths if needed.
- **Stop at external system boundaries.** If the code calls an external API or database, record the call and its parameters. Do not assume what the external system does without evidence.
- **Name the depth limit.** When the path has gone three layers deep and the behavior has not been found, stop and report. Ask the user whether to continue or to narrow the scope.

## Tool contracts

This skill uses no MCP tools. Use file reading tools directly:

| Task | Approach |
|---|---|
| Find entry point | Read `package.json` `main`, `bin`; read `src/index.ts`; read route files |
| Find function definition | Search for `function name`, `const name =`, `def name:`, `fn name` |
| Find callers | Search for the function name across the repo |
| Graph query | Read `graphify-out/graph.json`, search for node by name |

## Verification and acceptance criteria

Orientation is complete when:
1. The entry point is named and cited.
2. The path from entry point to the behavior is documented with file:line citations.
3. Each claim is labeled READ, INFERRED, or UNKNOWN.
4. No inferences are presented as facts.
5. The UNKNOWN list is explicitly stated (even if empty).

## Failure handling

- **Entry point not found** → read the README or the build configuration for the start command. If still unclear, ask.
- **Codebase is too large** → narrow the scope to the specific behavior, not the whole project. Read only what is on the call path.
- **Source is compiled or binary** → name the tool needed to decompile and stop. Do not infer from artifacts.
- **Path leads to an external service** → record the API call and stop. State that the external service's behavior requires its own source or documentation.

## Deliverables

1. One-sentence summary: entry point → behavior path.
2. Annotated call path (file:line, cited facts, inferences, unknowns).
3. Explicit list of files read.
4. List of unknowns and what would resolve each.
