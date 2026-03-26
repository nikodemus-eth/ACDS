# ACDS Database Migrations

## Migration Numbering

Migrations are numbered sequentially with a three-digit prefix (e.g., `001_`, `002_`). Each file is a standalone SQL script wrapped in a `BEGIN`/`COMMIT` transaction block.

| Migration | Description |
|-----------|-------------|
| 001 | Core tables: providers, provider_secrets, admin_sessions |
| 002 | Provider health tracking |
| 003 | Model profiles and tactic profiles |
| 004 | Global, application, and process policies |
| 005 | Execution records, rationales, and fallback attempts |
| 006 | Audit events |
| 007 | Adaptive optimizer state |
| 008 | Secret store and rollback snapshots |
| 009 | GRITS snapshots and execution/runtime alignment |

## Running Migrations

Apply migrations in order against your PostgreSQL database:

```bash
pnpm --filter @acds/db-tools run migrate
```

Or apply a single migration:

```bash
psql "$DATABASE_URL" -f infra/db/migrations/001_initial_core_tables.sql
```

## Conventions

- Most migrations are written to be re-runnable only where safe and where schema alignment is required for MVP upgrades.
- Foreign key references include `ON DELETE CASCADE` where appropriate.
- All timestamp columns use `TIMESTAMPTZ` and default to `NOW()`.
- UUIDs are generated server-side via `gen_random_uuid()`.
