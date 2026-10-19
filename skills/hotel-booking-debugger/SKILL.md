---
name: hotel-booking-debugger
description: Debug hotel booking flows by isolating request, inventory, pricing, and payment failure points.
entryType: instruction_skill
category: domain
tags: debugging, booking, hospitality
version: 0.1.0
validationStatus: validated
sourceId: just-do-it-local
---

# Hotel booking debugger

- Reproduce the failure with the smallest request that triggers it.
- Separate inventory, rate, availability, and payment concerns.
- Prefer logs and deterministic fixtures over speculative rewrites.
- Document the root cause and the regression coverage added.
