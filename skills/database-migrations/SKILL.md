---
name: database-migrations
description: Plan and apply backward-compatible database migrations with tested rollback paths.
entryType: instruction_skill
category: engineering
tags: database, migrations, sql
version: 0.1.0
validationStatus: validated
sourceId: just-do-it-local
---

# Database migrations

- Prefer additive, backward-compatible migrations.
- Define migration and rollback procedures before applying changes.
- Avoid destructive migrations without a verified recovery strategy.
- Test upgrades against representative existing data.
- Preserve immutable content references where the product requires them.
