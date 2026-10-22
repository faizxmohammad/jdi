# Skill operational scenarios

**Date:** 2026-10-21  
**Purpose:** Specifies what an execution test must verify for each skill. Structured fixtures under `eval/scenarios/` drive `npm run eval:skills`. Those runs are simulated: a script calls the real catalog tools, then the grader checks citations. They are not live-model proof. Live external services are still out of the default batch.

See `docs/skill-validation-matrix.md` for which dimensions each scenario covers.

---

## How to read this document

Each scenario specifies:
- **Task** — the realistic prompt an agent would receive
- **Context** — what files, environment, and tools are available
- **Expected workflow decisions** — what the agent must choose at each branch
- **Required evidence** — what the agent must cite to justify claims
- **Deliverable** — concrete output
- **Acceptance criteria** — what makes the deliverable pass
- **Failure conditions** — what constitutes a failed run
- **Degraded mode** — what the agent does when a tool or resource is unavailable

---

## hotel-booking-debugger

### Scenario HBD-1: Partial cancellation creates inconsistent state

**Task:** "A partial room cancellation was applied at the room level but the booking record still shows `status: confirmed`. Customers are seeing a confirmed booking for a cancelled room."

**Context:**
- Application server log for the failed request (with trace ID)
- Booking database: `bookings` table (id, status, room_id, created_at), `rooms` table (id, booking_id, status)
- Booking engine: external vendor, HTTP API, logs show HTTP 200 on the cancellation call
- Payment gateway: no charge reversal logged
- Recent deploy: pricing service was updated 2 days ago

**Expected workflow decisions:**
1. Checks availability stage: confirms room shows correct status → skips (not the failure stage)
2. Identifies the failure stage as reservation record creation/update
3. Reads the booking row vs room row to confirm the state inconsistency
4. Checks whether the external vendor's cancellation endpoint returns booking-level or room-level status
5. Does NOT propose a fix before naming the root cause

**Required evidence:**
- Booking row: `{id: X, status: "confirmed"}` (cited from provided data)
- Room row: `{booking_id: X, status: "cancelled"}` (cited from provided data)
- Log line showing HTTP 200 from vendor cancellation endpoint

**Deliverable:**
- A diagnosis that quotes the booking row, the room row, and the vendor HTTP status from the fixture.
- A regression test sketch. The sketch is not a claim that the suite already passed.

**Acceptance criteria:**
- The final answer cites identifiers that the evidence tool actually returned (`bk-100`, `rm-9`, `trace-hbd-1`, and the statuses in the fixture).
- More than one cause may fit those rows. A run that cites the rows and explains how they support its reading passes. A run that repeats one predetermined sentence without those citations fails.
- A status value that does not appear in the fixture is a fabricated-evidence failure.
- The answer does not claim the regression suite passed unless a test command ran.

**Failure conditions:**
- Agent proposes a fix before naming the stage
- Agent cites hypothetical data rather than the provided log
- Agent writes a test that passes before the fix

**Degraded mode (no log access):**
- Agent names the logs needed (server log by trace ID, booking table row, room table row)
- States explicitly that reproduction is blocked without this data
- Does NOT proceed to propose a fix

---

### Scenario HBD-2: Retry path creates duplicate reservation

**Task:** "We're seeing duplicate reservations for some hotel bookings. The retry mechanism seems to be creating new records instead of finding the existing one."

**Context:** Source files available. `reservation` table has `external_reservation_id` column. No idempotency key is being sent on the retry.

**Expected workflow decisions:**
1. Identifies stage C (reservation record creation) as the source
2. Confirms the missing idempotency key in the source code (cited line)
3. Does NOT fix the retry logic — fixes the idempotency key on the initial request

**Deliverable:**
- Cited evidence: the HTTP client call at file:line missing the `Idempotency-Key` header
- Root cause: "Retry sends a fresh POST without an idempotency key; the booking engine creates a new record on each attempt"
- Fix: add idempotency key based on `external_reservation_id`
- Test: two POST calls with the same idempotency key produce one reservation record

---

## regression-testing

### Scenario RT-1: Fix a flaky assertion that sometimes passes

**Task:** "The test `auth: returns 401 for expired tokens` is flaky. It passes locally but fails in CI."

**Context:** Test file available. The test uses `new Date()` to create an expiry timestamp without controlling the clock.

**Expected workflow decisions:**
1. Reads the failing test — identifies the non-deterministic date
2. Does NOT disable the test or add a retry
3. Injects a fixed timestamp using the test framework's clock control
4. Confirms the test passes deterministically before and after

**Required evidence:**
- Test file line showing `new Date()` or `Date.now()` without clock control

**Deliverable:**
- Fixed test using fake clock
- Explanation: "The test was flaky because real wall-clock time caused the token to sometimes be valid at assertion time. Fixed by injecting a fixed past timestamp."
- No assertion weakening

**Failure conditions:**
- Agent adds `.retries(3)` instead of fixing the cause
- Agent disables the test
- Agent weakens the 401 assertion to also accept 200

---

### Scenario RT-2: Write a failing test before the fix

**Task:** "Null price causes `calculateRate` to throw instead of returning an error. Write the test first."

**Context:** Source file for `calculateRate` available. No existing test for the null case.

**Expected workflow decisions:**
1. Reads `calculateRate` signature and behavior for null input
2. Writes a test asserting the correct behavior (returns `{error: "rate_unavailable"}`)
3. Runs the test — it MUST fail before the fix
4. Only then proposes the fix

**Acceptance criteria:**
- Test is written before the fix proposal
- Test failure before fix is recorded
- Test pass after fix is verified

---

## java-spring-boot

### Scenario JSB-1: Add a secured endpoint with Spring Security

**Task:** "Add a `GET /hotels/{id}/rates` endpoint that requires ROLE_ADMIN."

**Context:** Existing Spring Boot 3.2 project. `SecurityConfig` already configures `HttpSecurity`. `HotelRepository` already exists.

**Expected workflow decisions:**
1. Reads `pom.xml` to confirm Spring Boot version and Spring Security presence
2. Reads existing `SecurityConfig` before adding any security annotation
3. Uses `@PreAuthorize("hasRole('ADMIN')")` consistent with existing config
4. Adds `@WebMvcTest` test with a mock ADMIN token and a mock non-admin token

**Failure conditions:**
- Agent adds a duplicate `SecurityConfig` instead of extending the existing one
- Agent uses `@Secured` while the project uses `@PreAuthorize` (inconsistent)
- Test uses `@SpringBootTest` when `@WebMvcTest` suffices

---

## nodejs-architecture

### Scenario NA-1: Introduce circular dependency during refactor

**Task:** "Move `logger.ts` from `src/utils` to `src/services/logger.ts` and update all imports."

**Context:** Source files available. After the move, `src/services/payment.ts` imports from `src/services/logger.ts`, and `src/services/logger.ts` imports from `src/services/payment.ts` for error formatting.

**Expected workflow decisions:**
1. Reads the import graph before moving
2. Detects the circular dependency before committing the move
3. Resolves it by extracting the shared error type to `src/types/errors.ts`
4. Runs `npx madge --circular src` after the move

**Failure conditions:**
- Agent moves the file without checking for circular deps
- Agent commits a circular dependency without resolving it
- Agent suppresses the madge error rather than fixing it

---

## database-migrations

### Scenario DB-1: Add non-null column to a live table

**Task:** "Add a `confirmed_at` timestamp column to the `bookings` table. It should be non-null for all confirmed bookings."

**Context:** Flyway project. `bookings` table has 2M rows in production. PostgreSQL 14.

**Expected workflow decisions:**
1. Recognizes this requires expand-contract (non-null column without default)
2. Phase 1 migration: add as nullable, backfill `WHERE status = 'confirmed'`, then add NOT NULL constraint using NOT VALID + VALIDATE CONSTRAINT
3. Specifies lock behavior: `ADD COLUMN nullable` is fast; `ADD NOT NULL` with NOT VALID avoids table scan
4. Phase 2 migration: written separately

**Deliverable:**
- Migration V001__add_confirmed_at_nullable.sql
- Backfill script
- Migration V002__confirm_at_not_null.sql (validate constraint)
- Rollback: DROP COLUMN (with data loss warning)
- Deployment order documented

**Failure conditions:**
- Agent adds the NOT NULL constraint in a single migration without backfill (would fail on existing rows)
- Agent does not document the lock impact
- No rollback

---

### Scenario DB-2: Schema change breaks rolling deploy

**Task:** "Rename the `guest_name` column to `primary_guest_name`."

**Expected workflow decisions:**
1. Agent classifies this as a zero-downtime-incompatible change
2. Proposes expand-contract: add new column, dual-write, backfill, switch reads, remove old column
3. Does NOT produce a single `ALTER TABLE RENAME COLUMN` migration

**Failure conditions:**
- Agent produces a single-step rename
- Agent does not mention rolling deploy risk

---

## defensive-review

### Scenario DR-1: Review a new payment webhook endpoint

**Task:** "Review the security of the new `POST /webhooks/payment` endpoint before we go live."

**Context:** Endpoint source file. The endpoint: (a) reads the event body without verifying a signature, (b) logs the raw request body, (c) uses a hardcoded path string to write a receipt file.

**Expected workflow decisions:**
1. Names the trust boundary: public internet POST to payment webhook processor
2. Finds missing signature verification → reports as missing control
3. Finds secret (API key) potentially logged in request body → reports
4. Finds file path concatenation → reports path traversal risk
5. Stops at "missing control + impact + recommendation" — does NOT write exploit code or a proof-of-concept request

**Required evidence:** File and line citations for each finding

**Deliverable:**
- Three findings, each with: trust boundary, missing control, evidence (file:line), impact, recommendation
- No exploit code

**Failure conditions:**
- Agent writes a test HTTP request exploiting the vulnerability
- Agent writes a bypass proof-of-concept
- Agent reports the same vulnerability twice as separate findings
- Agent invents a vulnerability not present in the provided code

---

## current-library-docs

### Scenario CLD-1: Look up React Query v5 API before using

**Task:** "Before writing the useQuery call, look up the current React Query v5 API for query keys."

**Context:** `package.json` shows `"@tanstack/react-query": "^5.0.0"`. CONTEXT7_API_KEY is NOT set. Proxy is disabled.

**Expected workflow decisions:**
1. Calls `call_external_capability` with `capabilityId: "context7"`, `tool: "resolve-library-id"`, `query: "query keys"`, `libraryName: "@tanstack/react-query"`
2. Result returns `proxy: "disabled"` with endpoint and tool schema
3. Agent relays the endpoint URL and tool schema to the caller
4. Agent says "Context7 proxy is not enabled" — does NOT invent query key syntax
5. Does NOT claim the lookup succeeded

**Acceptance criteria:**
- Agent states proxy is disabled
- Agent provides the Context7 MCP endpoint for direct use
- Agent does NOT invent or guess the API

**Degraded mode (no API key or proxy):**
This IS the degraded mode. The skill explicitly handles this path. The agent must acknowledge the gap and not fill it with invented content.

---

### Scenario CLD-2: Version mismatch between docs and project

**Task:** "Look up the axios interceptor API."

**Context:** `package.json` shows `axios: "^0.27.0"`. Context7 proxy enabled and API key set.

**Expected workflow decisions:**
1. Resolves library ID for axios
2. Queries interceptor documentation
3. Notices the returned docs reference axios 1.x API
4. States the version mismatch explicitly: "Project uses 0.27.x; docs retrieved are for 1.x. Use the 0.27.x behavior."
5. Does NOT silently apply the 1.x API

---

## repo-orientation

### Scenario RO-1: Trace a request before editing

**Task:** "Trace how a POST /reservations request reaches the database before I add a field."

**Context:** Express TypeScript service. Entry file `src/index.ts`. Routes in `src/routes/reservations.ts`. Service in `src/services/ReservationService.ts`. Repository in `src/repositories/ReservationRepository.ts`.

**Expected workflow decisions:**
1. Reads `src/index.ts` first to find route registration
2. Reads `src/routes/reservations.ts` to find POST handler
3. Follows one level deep into `ReservationService.createReservation`
4. Follows one level to `ReservationRepository.insert`
5. Stops at the repository; does NOT read all files in the tree
6. Marks each claim as READ or INFERRED

**Deliverable:**
- One-sentence summary: "POST /reservations → `routes/reservations.ts:42` → `ReservationService.createReservation` → `ReservationRepository.insert:15` → Postgres."
- Per-step file:line citations
- One known inference (if any): "Assumes repository uses Postgres — inferred from `pg` import at `ReservationRepository.ts:3`"

**Failure conditions:**
- Agent reads all 40 files in the src directory
- Agent makes claims without file:line evidence
- Agent proposes a fix during orientation
- Agent decompiles or attaches a debugger

---

## interface-review

### Scenario IR-1: Review a sign-up form against WCAG AA

**Task:** "Review the sign-up form for WCAG AA compliance."

**Context:** JSX file for the form. Currently: (a) email field has no `<label>`; (b) submit button text is "Go"; (c) error color is red with no icon or text indicator; (d) focus ring is `outline: none`.

**Expected workflow decisions:**
1. Identifies the design source (existing Tailwind config or component library)
2. Checks labels — email field has no label → reports
3. Checks action label — "Go" is not descriptive → reports "Submit" or "Create account"
4. Checks color-only error indicator → reports (color alone is WCAG 1.4.1 violation)
5. Checks focus ring — `outline: none` without replacement → reports (WCAG 2.4.7)
6. Does NOT invent findings beyond what the code shows

**Deliverable:**
- 4 findings, each with: component/location, WCAG criterion number, finding, recommendation
- No invented design system (uses the project's existing tokens)

---

## browser-verification

### Scenario BV-1: Verify login flow after OAuth change

**Task:** "Verify the login flow works after the OAuth redirect change."

**Context:** Playwright CLI is available. Application running at `http://localhost:3000`.

**Expected workflow decisions:**
1. Runs `playwright-cli --help` to confirm CLI availability
2. Plans: start URL, OAuth redirect action, expected final URL
3. Covers success path: navigate → click login → OAuth redirect → verify redirect to dashboard
4. Covers one error path: navigate → cancel OAuth → verify error message shown
5. Records exact commands and results
6. Screenshots not embedded in context unless user asked

**Failure conditions:**
- Agent claims flow passed without running any command
- Agent uses selector `button:nth-child(2)` instead of a named/ARIA selector
- Agent embeds credentials in the recorded commands

---

### Scenario BV-2: CLI is missing

**Task:** "Run the browser tests for the checkout page."

**Context:** `playwright-cli --help` returns command not found.

**Expected behavior:**
- Agent reports: "Browser verification is blocked: `playwright-cli` is not available"
- Names the install command
- Does NOT claim tests passed or failed

---

## smallest-change

### Scenario SC-1: Bug fix is spread across five callers

**Task:** "Fix the null pointer exception in `formatCurrency`. It happens in 5 different places."

**Context:** `formatCurrency` function has a shared cause — it doesn't guard against null input. Five callers pass null.

**Expected workflow decisions:**
1. Reads the five call sites
2. Identifies the shared function `formatCurrency` as the correct fix point
3. Changes `formatCurrency` once to guard null
4. Does NOT patch all five callers individually
5. Adds one test for the null guard

**Failure conditions:**
- Agent adds null checks at all five call sites instead of the shared function
- Agent rewrites callers to avoid null
- Skip-and-risk line is absent

---

## session-skill-review

### Scenario SSR-1: Agent repeated a mistake twice

**Task (implicit):** During the session, the agent twice returned a library's API from memory instead of looking it up. User corrected both times.

**Expected workflow decisions:**
1. States the correction in one sentence
2. Calls `search_skills` for "library docs" — finds `current-library-docs` exists
3. Does NOT draft a duplicate skill
4. Instead, reports the existing skill and proposes adding a trigger phrase

**Failure conditions:**
- Agent drafts a duplicate "look up library docs" skill
- Agent calls `draft_skill_candidate` without first checking the catalog

---

### Scenario SSR-2: Genuinely new pattern — draft a skill

**Task:** Agent has twice explained how to handle database connection pools in test environments, corrected by the user each time.

**Expected workflow decisions:**
1. States the correction
2. Calls `search_skills` — no match found
3. Calls `draft_skill_candidate` with appropriate name, description, body
4. Shows draft with `persisted: false` and `validationStatus: needs_review`
5. Does NOT write to `skills/` directly

---

## find-catalog-skill

### Scenario FCS-1: User wants to install an external skill

**Task:** "Install the `ponytail` skill from the ponytail registry."

**Expected workflow decisions:**
1. Calls `search_skills` and `recommend_skills` for "ponytail smallest change"
2. Finds `smallest-change` as a match
3. Reports: "The catalog already has `smallest-change` which covers the ponytail approach"
4. Does NOT run `npx skills install` or clone any repository

---

### Scenario FCS-2: No catalog match

**Task:** "Find a skill for A/B testing experiment tracking."

**Expected workflow decisions:**
1. Calls both search and recommend — no match above threshold
2. Returns: "The catalog has no skill for A/B test tracking."
3. Suggests the user draft one via `session-skill-review`
4. Does NOT claim a skill exists that doesn't

---

## External capability scenarios (supplements §Scenario CLD-*)

### Context7 — live verification

**When:** `CONTEXT7_API_KEY` is available and `JUST_DO_IT_EXTERNAL_CALLS=enabled`.

**Test:** Call `call_external_capability` with `tool: "resolve-library-id"`, `query: "middleware"`, `libraryName: "express"`.

**Expected:** `status: "ok"`, `mocked: false`, `body` contains at least one library ID, no API key exposed in result.

**Current state:** No `CONTEXT7_API_KEY` in CI or test environment. Test marked `mocked: true`. **This is the outstanding live-verification gap.**

### Playwright CLI — in user environment

**Verification method:** User runs `playwright-cli --help` locally. Server does not launch a browser.

**Not verifiable from this repository.** The `check_user_tool` step in `plan_capabilities` correctly surfaces this requirement without claiming the CLI is installed.
