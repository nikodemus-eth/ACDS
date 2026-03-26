# @acds/grits-worker

Operator-facing GRITS worker and CLI entrypoints for ACDS integrity validation.

## Modes

- Fixture mode: local/demo validation against in-memory fixtures
- DB-backed mode: reads persisted ACDS runtime state and is the release posture

## Scripts

- `pnpm --filter @acds/grits-worker run test`
- `pnpm --filter @acds/grits-worker run grits:fast`
- `pnpm --filter @acds/grits-worker run grits:daily`
- `pnpm --filter @acds/grits-worker run grits:release`
- `pnpm --filter @acds/grits-worker run grits:pg:fast`
- `pnpm --filter @acds/grits-worker run grits:pg:daily`
- `pnpm --filter @acds/grits-worker run grits:pg:release`

## Required Runtime Inputs

- `DATABASE_URL` for DB-backed mode
- `GRITS_OUTPUT_PATH` if you want the snapshot artifact written to a specific path

## Release Behavior

- `grits:pg:release` exits non-zero when blocking defects are detected
- fixture scripts never represent the release gate
- snapshot artifacts are written to `GRITS_OUTPUT_PATH` when set, or to a timestamped JSON file otherwise
