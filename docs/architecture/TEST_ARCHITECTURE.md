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

A lightweight `node:http` server that binds to port 0 (OS-assigned) on `127.0.0.1`. Used by the two adapter test files (Ollama, Apple Intelligence).

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
await runMigrations(pool);              // Runs all 10 migration SQL files
await truncateAll(pool);                // Truncates all tables between tests
await closePool();                      // Cleans up
```

The `PoolLike` interface wraps PGlite to be compatible with `pg.Pool`:
- `query(text, params)` — parameterized queries
- `execSQL(sql)` — multi-statement SQL (used for migration files with BEGIN/COMMIT blocks)

**Used by:** All persistence tests (PgAdaptationEventRepository, PgAuditEmitters, PgRollbackRecordWriter, PgSecretCipherStore).

### GRITS Tests — In-Memory Repositories

**Location:** `apps/grits-worker/src/__test-support__/`

Two in-memory implementations that store data in arrays with real filtering logic:

- `InMemoryProviderRepository` — implements all 8 methods of `ProviderRepository`
- `InMemoryExecutionRecordReadRepository` — implements all 3 methods of `ExecutionRecordReadRepository` with real date range filtering

These are real implementations, not mocks — they perform the same logical operations as their Pg counterparts, just against in-memory data.

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

| Category | Count | Pattern |
|----------|-------|---------|
| Unit — pure functions | ~200+ | Direct function calls with constructed inputs |
| Unit — with TestHttpServer | ~53 | Real HTTP against adapter implementations |
| Unit — with PGlite | ~35 | Real SQL against in-process Postgres |
| Unit — with InMemory repos | ~17 | Real filtering against in-memory data |
| Integration — routing/dispatch | ~40 | Full pipeline with in-memory state |
| Red team — security | ~110 | Adversarial inputs against hardened code |
| Chaos — fault injection | ~19 | Failure path verification |
| Scenario — end-to-end | ~10 | Business workflow validation |

## Coverage Configuration

Coverage is scoped to files with runtime logic. Excluded from coverage:
- Pure type/interface files (no executable code)
- Enum definitions
- Entity type definitions
- Config default objects
- SDK client code (separate test infrastructure needed)
- React frontend (needs JSDOM/browser environment)
- Worker/app entry points (`main.ts`)

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
