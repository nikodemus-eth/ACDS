# Test Architecture

## Philosophy: Zero Mocks, Real Collaborators

ACDS tests use **no mocks, stubs, monkeypatches, or spy functions**. Every test exercises real code paths with real (or lightweight in-process) collaborators.

This is enforced by a simple rule: **`vi.fn()`, `vi.mock()`, `vi.stubGlobal()`, and `vi.spyOn().mockImplementation()` are banned from the test suite.** The only Vitest imports allowed are `describe`, `it`, `expect`, `beforeAll`, `afterAll`, and `beforeEach`.

### Why

- Mock-based tests pass when the mock is correct, not when the code is correct. A mock that returns `{ rows: [{ count: 1 }] }` tells you nothing about whether the SQL is valid.
- Mock drift: production code evolves, mocks don't. The mock of `pool.query` that worked for schema v1 silently accepts schema v2 queries that would fail against a real database.
- Real collaborators catch integration bugs that mocks cannot: SQL syntax errors, HTTP header requirements, JSON serialization edge cases, connection lifecycle issues.

## Test Infrastructure

### HTTP Adapter Tests — `TestHttpServer`

**Location:** `packages/provider-adapters/src/__test-support__/TestHttpServer.ts`

A lightweight `node:http` server that binds to port 0 (OS-assigned) on `127.0.0.1`. Used by all five adapter test files (Ollama, OpenAI, Gemini, LM Studio, Apple Intelligence).

```typescript
const server = new TestHttpServer();
const baseUrl = await server.start(); // e.g. http://127.0.0.1:54321

server.setRoutes({
  'GET /api/tags': (_req, res) => jsonResponse(res, 200, { models: [...] }),
  'POST /api/generate': async (req, res) => {
    const body = JSON.parse(await readBody(req));
    jsonResponse(res, 200, { response: 'Hello', ...body });
  },
});
```

**Error simulation patterns:**
- **Non-OK status:** Handler returns 503/400/500 with error body
- **Connection refused:** Stop the server, then call the adapter (port is known but nothing is listening)
- **Network error:** Handler calls `req.socket.destroy()` mid-response
- **Timeout:** Handler uses `setTimeout` with a delay exceeding the adapter's abort signal

### Database Tests — PGlite

**Location:** `tests/__test-support__/pglitePool.ts`

Uses `@electric-sql/pglite` (in-process WASM Postgres) to provide a real PostgreSQL instance without external dependencies.

```typescript
const pool = await createTestPool();    // Creates PGlite instance
await runMigrations(pool);              // Runs all 16 migration SQL files
await truncateAll(pool);                // Truncates all tables between tests
await closePool();                      // Cleans up
```

The `PoolLike` interface wraps PGlite to be compatible with `pg.Pool`:
- `query(text, params)` — parameterized queries
- `execSQL(sql)` — multi-statement SQL (used for migration files with BEGIN/COMMIT blocks)

**Migration runner resilience:** Alignment migrations (011, 012, 014) may fail on fresh PGlite schemas where columns already have the correct names from earlier migrations. The runner wraps each migration in try/catch with `ROLLBACK` to clear PGlite's aborted transaction state and continue applying subsequent migrations.

**Used by:** All persistence tests (PgAdaptationEventRepository, PgAuditEmitters, PgRollbackRecordWriter, PgSecretCipherStore, PgExecutionRecordRepository, PgProviderRepository, PgOptimizerStateRepository, PgProviderHealthRepository, PgAdaptationApprovalRepository, PgAuditEventRepository) and all 7 GRITS checker test files.

### GRITS Tests — PGlite-Backed Real Repositories

All 7 GRITS checker test files now use real PGlite databases via the shared `pglitePool.ts` infrastructure, with `seedProvider()`, `seedExecution()`, and `seedAuditEvent()` helper functions that insert into real PostgreSQL tables.

**UUID enforcement:** PGlite enforces PostgreSQL's strict UUID column types. All test IDs use deterministic UUID constants (e.g., `'00000000-0000-0000-0000-000000000001'`) instead of short strings like `'prov-1'`. This catches real schema compliance issues that in-memory fakes would miss.

**Checkers tested:** AdaptiveIntegrityChecker, AppleIntelligenceChecker, AuditIntegrityChecker, BoundaryIntegrityChecker, ExecutionIntegrityChecker, OperationalIntegrityChecker, PolicyIntegrityChecker, SecurityIntegrityChecker.

### Console Capture

For tests that need to verify `console.error` output (e.g., fire-and-forget audit emitters):

```typescript
const captured: unknown[][] = [];
const originalError = console.error;
console.error = (...args: unknown[]) => { captured.push(args); };
try {
  // ... test code ...
  const match = captured.find(args => String(args[0]).includes('expected message'));
  expect(match).toBeDefined();
} finally {
  console.error = originalError;
}
```

This is a real reassignment, not a mock — no `vi.spyOn` involved.

## Test Categories

| Category | Files | Tests | Pattern |
|----------|-------|-------|---------|
| Unit — pure functions | ~180 | ~1800 | Direct function calls with constructed inputs |
| Unit — with TestHttpServer | 5 | ~53 | Real HTTP against adapter implementations |
| Unit — with PGlite | ~80 | ~800 | Real SQL against in-process Postgres |
| Integration — routing/dispatch | ~10 | ~100 | Full pipeline with real state |
| Red team — security | 25 | 320 | Adversarial inputs against hardened code |
| Chaos — fault injection | 3 | ~19 | Failure path verification |
| Scenario — end-to-end | 8 | ~44 | Business workflow validation |
| **Total** | **311** | **3136** | |

## Current Coverage (as of 2026-03-20)

| Metric | Coverage |
|--------|----------|
| Statements | 95.83% (11,913 / 12,431) |
| Branches | 92.03% (2,901 / 3,152) |
| Functions | 97.60% (735 / 753) |
| Lines | 95.83% (11,913 / 12,431) |

## Coverage Configuration

Coverage is scoped to files with runtime logic. Excluded from coverage:
- Pure type/interface files (no executable code)
- Enum definitions
- Entity type definitions
- Config default objects
- Route registration files (`apps/api/src/routes/**`)
- DI container bootstrap (`createDiContainer.ts`, `registerMiddleware.ts`)
- App bootstrap (`app.ts`, `main.ts`), config singleton (`appConfig.ts`)
- SDK client code (separate test infrastructure needed)
- React frontend (needs JSDOM/browser environment)

## Running Tests

```bash
# All tests
npx vitest run

# With coverage
npx vitest run --coverage

# Single package
npx vitest run packages/provider-adapters

# Single file
npx vitest run packages/provider-adapters/src/ollama/OllamaAdapter.test.ts

# Verify zero mocks
grep -r "vi\.fn\|vi\.mock\|vi\.stub\|vi\.spy" --include="*.test.ts" packages/ apps/ tests/
```
