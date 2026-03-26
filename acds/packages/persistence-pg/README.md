# @acds/persistence-pg

PostgreSQL persistence adapters and audit/event writers for ACDS runtime state.

## Scripts

- `pnpm --filter @acds/persistence-pg run build`
- `pnpm --filter @acds/persistence-pg run test`
- `pnpm --filter @acds/persistence-pg run typecheck`

The package backs the DB-facing runtime path used by the API, worker, and GRITS release gate.
