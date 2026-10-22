---
name: database-migrations
description: Plan and apply backward-compatible database schema migrations with tested rollback paths; covers expand-contract, lock awareness, and data validation.
entryType: instruction_skill
category: engineering
tags: database, migrations, sql, flyway, liquibase, schema, postgres, rollback
triggers: flyway, liquibase, schema change, database migration, alter table, add column, db migration
provides: schema-migration
outputs: A migration script, a rollback script, and a test of both against representative data.
version: 0.2.0
validationStatus: validated
sourceId: just-do-it-local
---

# Database migrations

## Purpose and scope

Use this skill when the task requires a schema change: adding a column, renaming a table, changing a constraint, adding an index, or removing a deprecated column.

Activate it when: the project uses Flyway, Liquibase, a raw SQL migration runner, or an ORM with migration generation (Django, Rails, Alembic, TypeORM).

Do not use this skill for: seed data changes that do not alter schema, data-only ETL jobs, changes managed by an admin through a GUI, or infrastructure changes to the database server itself.

## Prerequisites

Before writing any migration:
1. **Identify the migration tool** — read `pom.xml`, `build.gradle`, `package.json`, or the project README for the migration runner. Read its configuration to find the migration directory and naming convention.
2. **Read the current schema** — identify the table(s) touched, existing columns and types, primary keys, foreign keys, indexes, and constraints.
3. **Understand the deployment model** — is the migration applied before or after the application deploys? Can both old and new application code run during the migration (rolling deploy)?
4. **Check for active locks** — on Postgres, certain DDL operations take an `ACCESS EXCLUSIVE` lock. Know which operations will lock and for how long.

If the deployment model is unknown, ask before writing the migration. A migration that requires application downtime must be explicitly planned.

## Workflow

### 1. Classify the change

| Type | Safe for zero-downtime deploy? | Notes |
|---|---|---|
| Add nullable column | Yes | Default value is optional |
| Add column with non-null + default | Yes (with backfill) | Need expand-contract |
| Add index `CONCURRENTLY` | Yes | Postgres only; not transactional |
| Add foreign key | With care | Validate after backfill |
| Drop column | Only after old code removed | Expand-contract required |
| Rename column | No | Use an alias (view/generated) |
| Change column type | No unless compatible | Test widening vs narrowing |
| Drop table | No | Multi-step |

For any change marked "No", use the expand-contract pattern (§2).

### 2. Apply expand-contract when needed

**Expand-contract** prevents schema changes from breaking a running application:

**Phase 1 (expand):**
- Add the new column/table alongside the old one.
- Deploy application code that writes to both.
- Run a backfill to populate new column from old data.

**Phase 2 (contract):**
- After all application instances use the new column, remove the old one.
- Remove dual-write code from the application.

Write each phase as a separate, numbered migration file. Never combine expand and contract in one file.

### 3. Write the migration

- Name the file following the project's convention. Flyway: `V{version}__{description}.sql`. Liquibase: `{timestamp}_description.xml/yaml`. Django: auto-generated name.
- Every destructive operation (`DROP COLUMN`, `DROP TABLE`, `ALTER COLUMN TYPE`) must have a comment stating the rollback step.
- Use `-- ROLLBACK:` comments inline for SQL migrations.
- For Postgres: prefer `ADD COLUMN ... DEFAULT expression` (Postgres 11+) over a separate `ALTER COLUMN ... SET DEFAULT` followed by an `UPDATE` — the former avoids a table rewrite.
- For MySQL/MariaDB: note which `ALTER TABLE` operations copy the table vs use in-place DDL.

### 4. Write the rollback

Every migration must have a corresponding rollback. For tools that support it (Liquibase rollback blocks, Flyway undo migrations, Alembic `downgrade()`):
- Write the rollback in the same file or a paired file.
- The rollback must return the schema to the exact state before the migration.
- If the rollback is destructive (e.g. dropping a column that was just added with backfilled data), document the data loss explicitly.

For tools without built-in rollback support, write a manual rollback SQL file and name it clearly: `V{version}__rollback__{description}.sql`.

### 5. Validate against representative data

Before applying to production:
- Run the migration against a copy of the production dataset or a representative sample.
- Check execution time — if a full-table scan takes more than your maintenance window, consider batched backfills.
- Validate data integrity after migration: run `SELECT COUNT(*) WHERE new_column IS NULL` and similar checks.
- Run the rollback immediately after on the same dataset. Confirm the schema is restored correctly.

### 6. Plan the deployment order

Write the deployment sequence explicitly:
1. Apply migration (pre-deploy or post-deploy).
2. Deploy application code.
3. Run backfill job (if needed).
4. Apply contract migration (phase 2, if expand-contract).

Confirm the sequence with the team before executing. Do not apply the migration and then assume.

## Decision rules

- **Prefer additive over destructive.** If in doubt, add the new structure first, migrate data, confirm, then remove the old.
- **Never rename a column in one step.** Rename requires expand-contract over multiple deploys.
- **Never add a non-null column without a default or backfill in an existing table.** Inserting without the column will fail on existing application instances.
- **Index creation on large tables blocks reads (without CONCURRENTLY on Postgres).** Always use `CREATE INDEX CONCURRENTLY` on Postgres for tables over 10k rows in production.
- **Foreign key validation after backfill.** Add the constraint `NOT VALID`, backfill, then `VALIDATE CONSTRAINT` in a separate migration. This avoids a table scan at constraint creation.
- **Immutable content identifiers must not be changed.** If the primary key or a public ID column is used as a stable reference (event sourcing, URL slug), it must not be altered or recycled.

## Tool contracts

No MCP tools are required. The migration runner executes in the user's environment:
- Flyway: `mvn flyway:migrate`, `./gradlew flywayMigrate`
- Liquibase: `liquibase update`, `liquibase rollback <tag>`
- Alembic: `alembic upgrade head`, `alembic downgrade -1`
- Django: `python manage.py migrate`, `python manage.py migrate <app> <prev>`
- TypeORM: `npx typeorm migration:run`, `npx typeorm migration:revert`

Run the migration in a transaction when the tool supports it. Check whether the tool wraps DDL in a transaction — some do not.

## Verification and acceptance criteria

A migration is complete when:
1. The migration runs cleanly against the test/staging database.
2. The rollback runs cleanly and restores the schema.
3. The application starts successfully after the migration.
4. Data integrity checks pass (no unexpected nulls, orphaned rows, or constraint violations).
5. The migration applies within the planned maintenance window (or is confirmed safe for a rolling deploy).

## Failure handling

- **Migration fails partway through** → check whether the tool wraps DDL in a transaction (Postgres supports transactional DDL for most operations). If not, write a cleanup migration that removes partial changes.
- **Lock timeout on production table** → break the migration into smaller operations. Use `LOCK TIMEOUT` / `STATEMENT TIMEOUT` in Postgres to prevent indefinite waiting.
- **Backfill job is too slow** → batch the backfill: `UPDATE table SET new_col = expr WHERE new_col IS NULL LIMIT 10000`. Loop until done.
- **Rollback loses data** → this is expected when a column is dropped. Document the data loss before running in production. Offer a pre-migration backup step.
- **Migration conflicts with another branch's migration** → resolve by renumbering. Never re-use a migration version number.

## Deliverables

1. Migration file(s) — correctly named and ordered.
2. Rollback file(s) or rollback blocks inside the migration.
3. Data integrity check queries.
4. Deployment sequence (numbered steps).
5. Execution time estimate against the production table size.
