---
name: hotel-booking-debugger
description: Debug hotel booking flows by isolating the failure to one stage — availability, pricing, reservation, or payment — before changing any code.
entryType: instruction_skill
category: domain
tags: debugging, booking, hospitality, payment, availability, checkout
triggers: hotel booking, checkout payment, booking failure, reservation error, payment declined, availability mismatch
provides: booking-diagnosis
outputs: A written diagnosis naming the exact stage that fails, the evidence used to isolate it, and the regression test added.
version: 0.2.0
validationStatus: validated
sourceId: just-do-it-local
---

# Hotel booking debugger

## Purpose and scope

Use this skill when a hotel booking flow fails, produces wrong output, or behaves inconsistently across environments. The flow covers: **availability → room pricing → guest/reservation record creation → payment authorisation → confirmation delivery**.

Activate it for: failed checkouts, wrong prices, double-bookings, duplicate charges, payment declines specific to a card type or channel.

Do not activate it for: general UI bugs unrelated to the booking transaction, admin console issues, loyalty/reward calculation, or infrastructure outages — those need separate skills.

## Prerequisites

Before starting, collect:
1. **The request that failed** — method, URL or RPC name, headers relevant to auth, rate plan code, date range, room/property identifiers.
2. **The observed failure** — HTTP status or error code, error message verbatim, correlation ID or trace ID if present.
3. **Environment** — dev/staging/production, booking engine vendor (if external), payment gateway name.
4. **Recent changes** — git log or deploy log covering the 48 hours before the first failure.

If you cannot get at least the request and the failure message, stop. Ask the user for both before proceeding.

## Workflow

### 1. Reproduce the failure

- Construct the smallest request that triggers the reported failure. Start from the logged request if available; otherwise reconstruct from the user description.
- Confirm the failure is reproducible. If it is not reproducible, document the reproduction attempt and ask whether it was intermittent.
- Record: method, URL, sanitised request body (no raw credentials), response status, response body.

### 2. Stage isolation

Booking flows fail at one stage even when the error message names a different one. Isolate in this order:

**A. Availability check**
- Call the availability endpoint directly with the same dates, property, and room type.
- Expect: a list of rooms with rates attached.
- Failure signs: empty result, wrong rate plan, closed-out dates, mismatched currency.
- If availability is wrong, the root cause is here. Proceed to §Diagnosis.

**B. Rate/pricing**
- Call the pricing or rate-lookup endpoint with the room type and stay from step A.
- Expect: a non-null, positive price in the booking currency.
- Failure signs: zero price, null, wrong tax calculation, price that changes between step A and step B.
- If pricing is wrong, root cause is pricing. Proceed to §Diagnosis.

**C. Reservation record creation**
- Submit the reservation (without payment) if the system supports it, or examine the reservation table directly.
- Expect: a reservation ID and a status in {pending, pre-authorised}.
- Failure signs: duplicate reservation IDs, constraint violations, missing fields, reservation in rejected status before payment starts.
- If record creation fails, root cause is reservation write path.

**D. Payment authorisation**
- Inspect the payment gateway log, the charge table, and the error code from the gateway.
- Map the gateway error code to its documented meaning (declined, CVV mismatch, 3DS required, fraud rule, duplicate).
- Do not assume "card declined" means the card is bad; check whether the same card succeeds on a different channel or amount.
- Failure signs: gateway timeout, idempotency key collision, currency mismatch, 3DS not supported on the integration path.

**E. Confirmation delivery**
- If reservation and payment both succeed but the user reports no confirmation, check: email queue, webhook delivery log, idempotency of confirmation generation.

### 3. Read logs and traces before reading code

Once the stage is isolated, collect the system's own evidence:
- Server log lines covering the request (filter by correlation ID).
- Payment gateway event log for the transaction.
- Database row state: reservation record, payment record, inventory record.

Prefer reading logs and database state to reading source code. Source code explains what should happen; logs explain what did happen.

### 4. Confirm with a deterministic fixture

If the issue reproduces only with specific data (date range, room type, rate plan, card type), create a minimal fixture that reliably triggers it. This fixture becomes the regression test input.

If you cannot create a deterministic fixture, document why: intermittent, environment-specific, or data-dependent.

### 5. Identify the root cause

Write a one-sentence root cause before touching any code: "The availability endpoint returns a closed-out room type when the requested dates cross a Sunday because the rate calendar has no Sunday entry."

If the evidence does not support a single root cause, stop. Present the competing hypotheses and the evidence for each. Ask the user which to investigate first.

## Decision rules

- **Stage boundaries are hard.** Do not fix code in stage B because stage A returned bad data. Fix the stage where the bad data originates.
- **Payment failures that repeat identically** are almost always a configuration or integration bug, not a transient gateway problem.
- **Pricing that differs between environments** is almost always a rate-plan or tax-rule configuration difference, not a code bug.
- **Idempotency violations** (duplicate reservations, double charges) mean the retry path is not idempotent. Fix the idempotency key, not the retry logic.
- **If the booking engine is a third-party system**, do not change its internal logic. Document the contract violation and the required fix in the integration layer.

## Tool contracts

No MCP tools are required. Use these sources in priority order:
1. Server application logs (read files or query log aggregator).
2. Database — direct query or admin UI output the user provides.
3. Payment gateway dashboard — the user provides the transaction log.
4. Source files — read only after you have read the logs.

## Verification and acceptance criteria

A diagnosis is complete when:
- The stage is named.
- The evidence from that stage is cited (log line, DB row, or API response, not a hypothesis).
- A reproducing fixture exists or the reason it cannot be created is documented.
- A regression test exists (or a specific blocker to writing it is named).

Do not close the diagnosis without the regression test. The test must fail against the current code before the fix and pass after.

## Failure handling

- **Cannot reproduce** → document the reproduction attempt, the environment tried, and the request sent. Ask the user to provide a trace ID or database state.
- **External gateway returns an opaque error** → look up the error code in the gateway's public documentation. Do not guess the meaning.
- **Multiple stages fail simultaneously** → fix stage A first. Re-test stages B–E after A is fixed. Multi-stage failures are usually one upstream cause.
- **Destructive operations (manual DB writes, gateway voids)** → ask for explicit confirmation from the user. State the exact change and its consequences before proceeding.

## Deliverables

1. Stage diagnosis: named stage + cited evidence.
2. Root cause: one sentence.
3. Fix: a diff or a description small enough to fit one PR.
4. Regression test: one test that fails before the fix and passes after.
5. Any reproduction fixture used.
