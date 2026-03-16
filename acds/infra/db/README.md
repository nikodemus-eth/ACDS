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

## Running Migrations

Apply migrations in order against your PostgreSQL database:

```bash
# Apply all migrations in order
for f in infra/db/migrations/*.sql; do
  psql "$DATABASE_URL" -f "$f"
done
```

Or apply a single migration:

```bash
psql "$DATABASE_URL" -f infra/db/migrations/001_initial_core_tables.sql
```

## Conventions

- Each migration is idempotent-safe within its transaction (uses `CREATE TABLE`, not `CREATE TABLE IF NOT EXISTS`, to catch accidental re-runs).
- Foreign key references include `ON DELETE CASCADE` where appropriate.
- All timestamp columns use `TIMESTAMPTZ` and default to `NOW()`.
- UUIDs are generated server-side via `gen_random_uuid()`.
