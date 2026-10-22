---
name: nodejs-architecture
description: Design and evolve Node.js TypeScript services with clear module boundaries, safe defaults, and async error handling; covers ESM/CJS, lifecycle, and configuration separation.
entryType: instruction_skill
category: engineering
tags: nodejs, typescript, architecture, esm, express, fastify, modules
triggers: express typescript, node.js module, node service, nodejs architecture, typescript module, module boundary, fastify endpoint
provides: node-service
outputs: A module-boundary change that follows existing Node patterns, with updated types and a passing test for the changed surface.
version: 0.2.0
validationStatus: validated
sourceId: just-do-it-local
---

# Node.js / TypeScript architecture

## Purpose and scope

Use this skill when the task involves a Node.js service written in TypeScript: adding an endpoint, refactoring a module, changing an import boundary, updating error handling, or adjusting application lifecycle.

Activate it when: `package.json` has `"type": "module"` or the project uses `ts-node`, `tsx`, `esbuild`, or `tsc` and the runtime is Node.

Do not use this skill for: React/Next.js UI components (use the front-end rules), Deno projects, worker threads that behave like separate processes, or CLI scripts — those may need a narrower scope.

## Prerequisites

Before editing:
1. Read `package.json` to confirm `"type"`, the Node version in `engines` or `.nvmrc`, and which framework is in use.
2. Read `tsconfig.json` — note `module`, `target`, `moduleResolution`, `exactOptionalPropertyTypes`, `strict`, and `paths`.
3. Identify the module graph for the files you will change. Read the entry file, then read the imports one level deep. Do not load the whole tree into context.
4. Read the existing test for the module under change — note mocking approach (vi.mock, jest.mock, sinon, td.replace) and test runner.

## Workflow

### 1. Establish the module boundary

A module boundary is a single file that exports a public interface and keeps its internals private. Before changing a module, answer:
- What does this module export?
- Who imports it?
- What does it import?

If the answers reveal that the module re-exports from 10 places or that two modules are circularly dependent, note the design problem but do not fix it unless the task asks for it.

### 2. Plan the smallest correct change

State the change in one sentence:
- "Add a `POST /sessions` route to `src/routes/sessions.ts` that calls `SessionService.create`."
- "Replace the synchronous `fs.readFileSync` in `src/config/loader.ts` with `fs/promises.readFile` and bubble the error to the caller."

If the change is cross-cutting (affects more than three modules), split it into sequential steps. Do each step with a passing test suite before the next.

### 3. Validate external input at the boundary

- Parse and validate all incoming data at the HTTP handler or process entry before it reaches business logic.
- Use a schema library (Zod, Joi, yup) consistent with what the project already uses. Do not introduce a second schema library.
- Return HTTP 400 with a structured error body for validation failures. Do not let validation errors propagate as unhandled promise rejections.
- Never pass raw user-supplied file paths to `fs` functions. Resolve against an allow-listed directory and confirm the resolved path stays within it.

### 4. Keep configuration out of business logic

- Configuration (env vars, file paths, timeouts, feature flags) must be read at startup in one place and passed into modules as constructor arguments or function parameters.
- Do not read `process.env` inside service functions — it makes them impossible to test in isolation and breaks config validation at startup.
- If the project uses a `@ConfigurationProperties` pattern (a typed config object validated at startup), extend it rather than adding a new `process.env` read elsewhere.

### 5. Handle async errors

- Every `async` function must have a strategy for its rejected path: `try/catch`, `.catch()`, or — for Express — calling `next(err)`.
- Do not use uncaught exception handlers (`process.on("uncaughtException", ...)`) as a substitute for correct error handling. They prevent clean shutdown and can hide bugs.
- For Fastify: use the built-in error handler (`fastify.setErrorHandler`). For Express: add an error-handling middleware `(err, req, res, next)` at the end of the middleware stack.
- Close database connections and server handles in the `SIGTERM` handler to prevent k8s pod termination leaks.

### 6. Manage ESM/CJS boundaries

- In `"type": "module"` projects, import with file extensions (`.js` for TypeScript source). TypeScript resolves `.ts` but Node needs `.js`.
- Do not mix `require()` and `import` in the same file.
- If a dependency is CJS-only, use a dynamic `import()` in an async function. If that is not feasible, document the boundary and propose a workaround.
- Check `moduleResolution` in `tsconfig.json`: `"Bundler"` or `"Node16"` require different import styles.

### 7. Write the tests

| Change type | Test approach |
|---|---|
| Service function | Unit test; inject dependencies via constructor or function argument |
| HTTP route | Supertest or Fastify `inject()` with mocked service |
| Config loading | Unit test with `process.env` manipulation isolated per test |
| Async error path | Test that rejected promises surface as HTTP 500 or the specified error code |

Do not use `any` to work around TypeScript errors in tests. If a type is wrong, fix the type.

### 8. Circular dependency check

After the change, run `npx madge --circular src` or equivalent. If a circular dependency is introduced, remove it before committing. Circular imports cause subtle runtime failures in ESM.

## Decision rules

- **Explicit interfaces over implicit duck typing.** Export a TypeScript interface for each module's public surface. Callers that import only the interface can be tested without the implementation.
- **Functions over classes when state is minimal.** A module that exports one or two functions does not need to be a class. Prefer plain functions for stateless utilities.
- **Named exports over default exports.** Default exports break tree-shaking and make refactoring harder.
- **When two modules want to depend on each other**, introduce a third module (event emitter, shared type, or mediator) that both import. Never resolve a circular dependency by merging both modules.
- **Do not add a dependency for a utility the standard library provides.** Check `node:crypto`, `node:path`, `node:url`, `node:stream`, `node:events` before installing a package.

## Verification and acceptance criteria

After the change:
1. `npx tsc --noEmit` passes with no new errors.
2. All tests pass.
3. `npx madge --circular src` shows no new circular dependencies.
4. The one-sentence plan matches the actual diff.

## Failure handling

- **TypeScript error you cannot explain** → read the tsconfig and the type definitions. Do not use `as any` or `@ts-ignore` as a first response.
- **Test imports fail at runtime (ERR_REQUIRE_ESM, etc.)** → check `moduleResolution` and file extension usage. Adjust the import, not the tsconfig.
- **Service function has too many parameters** → introduce a typed options object. Do not add more parameters.
- **Cannot test without the real database** → the module has a missing abstraction layer. Introduce a repository interface, inject a mock in tests.

## Deliverables

1. Changed source files.
2. Updated TypeScript types (no new `any`).
3. Tests for the changed surface (happy path + one error path).
4. One line: what was explicitly not changed.
