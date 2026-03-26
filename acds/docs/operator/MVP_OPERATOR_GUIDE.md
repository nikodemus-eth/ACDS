# ACDS MVP Operator Guide

## 1. Bootstrap

```bash
cd acds
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm run bootstrap
cp .env.example .env
```

Create a master key file and set `MASTER_KEY_PATH` in `.env`.

`npm install` is not a supported substitute for this workspace. The product relies on `workspace:*` linking across apps and packages.

## 2. Validate and Seed Config

```bash
pnpm --filter @acds/db-tools run seed:validate
pnpm --filter @acds/db-tools run migrate
pnpm --filter @acds/db-tools run seed
```

## 3. Start the Product Surface

```bash
pnpm --filter @acds/api run build
pnpm --filter @acds/admin-web run build
pnpm --filter @acds/worker run build
pnpm --filter @acds/grits-worker run build

pnpm --filter @acds/api run start
pnpm --filter @acds/admin-web run preview -- --host 0.0.0.0 --port 4173
pnpm --filter @acds/worker run start
```

Operator posture for the admin UI:

- `preview` is the supported MVP operator path
- `dev` is a developer-only live-reload workflow
- `dev:mock` is a non-release/demo-only workflow

## 4. Register a Provider

Use the admin UI or provider API to register an MVP-supported local provider:

- Ollama at `http://localhost:11434`
- LM Studio at `http://localhost:1234`

## 5. Run One Dispatch

1. Call `POST /dispatch/resolve` to verify routing resolves against the seeded model/tactic profiles.
2. Call `POST /dispatch/run` only after a reachable provider is registered.
3. Verify the result is persisted in executions and audit views.

## 6. Inspect Audit

- `GET /health`
- `GET /audit`
- `GET /executions`

Audit events should show routing and execution lifecycle entries for real dispatches.

## 7. Run GRITS

Fixture mode:

```bash
pnpm --filter @acds/grits-worker run grits:fast
```

Fixture mode is for local/demo validation only.

DB-backed release mode:

```bash
pnpm --filter @acds/grits-worker run grits:pg:release
```

The `grits:pg:*` commands are the release path. `grits:pg:release` exits non-zero if blocking GRITS defects are detected.

## 8. Interpret Snapshot Outcomes

- `green`: no invariant failures and no blocking defects
- `yellow`: warnings or non-blocking integrity concerns
- `red`: at least one invariant failed

Blocking for release:

- any `critical` defect
- any `high` defect
- any `red` overall snapshot
