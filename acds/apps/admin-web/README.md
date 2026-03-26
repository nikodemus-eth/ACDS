# @acds/admin-web

Standalone admin UI for operating ACDS providers, policies, audit, and runtime state.

## Modes

- `preview`: canonical MVP operator-facing mode
- `dev`: developer live-reload mode
- `dev:mock`: non-release/demo-only mode with seeded browser mocks

## Scripts

- `pnpm --filter @acds/admin-web run build`
- `pnpm --filter @acds/admin-web run typecheck`
- `pnpm --filter @acds/admin-web run preview -- --host 0.0.0.0 --port 4173`
- `pnpm --filter @acds/admin-web run dev`
- `pnpm --filter @acds/admin-web run dev:mock`
