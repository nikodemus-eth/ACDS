# Admin UI Development and Demo Mode

The admin web application (`apps/admin-web`) now supports two useful local workflows:

- **Live API mode** for full-stack development against `apps/api`
- **Mock mode** for UI development, demos, and smoke checks without the API or Postgres

## Live API Mode

Use live mode when you want the UI to call the real API server.

```bash
pnpm dev
```

Or run only the frontend:

```bash
pnpm --filter @acds/admin-web run dev
```

By default, the Vite dev server proxies `/api` requests to the API server on `http://127.0.0.1:3100`.

## Mock Mode

Use mock mode when you want a self-contained UI preview with seeded in-memory data.

```bash
pnpm --filter @acds/admin-web run dev:mock
```

Mock mode enables `VITE_USE_MOCKS=true`, which routes all frontend API calls through the in-browser mock transport in `src/lib/mockApi.ts`.

This mode is useful for:

- Visual design work
- Page-by-page UI QA
- Demoing provider, profile, policy, adaptation, audit, and execution screens
- Exercising approval, rollback, and provider creation flows without backend dependencies

The top bar shows a `Mock data` badge whenever mock mode is active.

## Supported Mocked Surfaces

The built-in mock transport covers the current routed admin experience:

- Providers list, detail, create, disable, and test connection
- Model profiles and tactic profiles list, create, read, and update
- Global, application, and process policies list, create, read, update, and delete
- Adaptation family performance, candidate rankings, recommendations, and events
- Approval queue, approval detail, approve, and reject
- Rollback candidate list, preview, execution, and history
- Audit event list and detail
- Executions list, filtered list, and detail

## Notes on Fidelity

Mock mode is intentionally shaped like the API contract, but it is not persistence-backed.

- Mock changes are reset when the browser session reloads
- Profile mutations in mock mode do not touch API or database state
- Approval and rollback actions simulate the operator workflow but do not exercise the real adaptive repositories

Use live mode when you need true end-to-end verification of persistence, auth headers, or repository behavior.

## API Expectations

The admin web currently expects these backend route groups:

- `/providers`
- `/profiles`
- `/policies`
- `/audit`
- `/executions`
- `/adaptation`
- `/adaptation/approvals`
- `/adaptation/rollbacks`

For authenticated calls, the API accepts either:

- `x-admin-session: <ADMIN_SESSION_SECRET>`
- `Authorization: Bearer <ADMIN_SESSION_SECRET>`

## Recommended Verification Loop

For frontend changes:

1. Run `pnpm --filter @acds/admin-web run build`
2. Run `pnpm --filter @acds/admin-web run dev:mock`
3. Walk the routed screens in a browser
4. Use live API mode before merging changes that depend on backend contract updates
