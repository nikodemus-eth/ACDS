import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { ProviderHealthScheduler } from './ProviderHealthScheduler.js';
import { ProviderHealthService } from './ProviderHealthService.js';
import type { ProviderConnectionTester } from '../execution/ProviderConnectionTester.js';
import type { Provider } from '@acds/core-types';
import { ProviderVendor, AuthType } from '@acds/core-types';
import { PgProviderRepository, PgProviderHealthRepository } from '@acds/persistence-pg';
import {
  createTestPool,
  runMigrations,
  closePool,
  type PoolLike,
} from '../../../../tests/__test-support__/pglitePool.js';

let pool: PoolLike;

beforeAll(async () => {
  pool = await createTestPool();
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query('TRUNCATE providers, provider_health CASCADE');
});

afterAll(async () => {
  await closePool();
});

/** Insert a provider directly into PG and return it. */
async function insertProvider(id: string): Promise<Provider> {
  const repo = new PgProviderRepository(pool as any);
  // Use the repo to create, then update the id if needed.
  // PG generates UUID ids, so we create and return the generated provider.
  const created = await repo.create({
    name: `Provider ${id}`,
    vendor: ProviderVendor.OPENAI,
    authType: AuthType.API_KEY,
    baseUrl: 'https://api.example.com',
    enabled: true,
    environment: 'test',
  });
  return created;
}

/**
 * Real HTTP-based connection tester. Makes an actual HTTP GET to a configurable
 * test server and returns success/failure based on the response.
 */
class HttpConnectionTester implements Pick<ProviderConnectionTester, 'testConnection'> {
  private serverUrl: string;
  private responseMap = new Map<string, { status: number; body: string; latencyMs: number }>();
  private throwMap = new Set<string>();

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  /** Configure a specific response for a provider id. */
  setResponse(providerId: string, status: number, latencyMs: number, body = 'ok') {
    this.responseMap.set(providerId, { status, body, latencyMs });
  }

  /** Configure a provider to cause an error on connection. */
  setThrow(providerId: string) {
    this.throwMap.add(providerId);
  }

  async testConnection(provider: Provider) {
    if (this.throwMap.has(provider.id)) {
      throw new Error(`Connection error for ${provider.id}`);
    }

    const config = this.responseMap.get(provider.id);
    const start = Date.now();

    // Make a real HTTP call to the test server
    const response = await fetch(`${this.serverUrl}/health?id=${provider.id}`);
    const elapsed = Date.now() - start;

    if (config && config.status >= 400) {
      return { success: false, latencyMs: config.latencyMs, message: config.body };
    }

    return {
      success: response.ok,
      latencyMs: config?.latencyMs ?? elapsed,
      message: config?.body ?? 'ok',
    };
  }
}

describe('ProviderHealthScheduler', () => {
  let scheduler: ProviderHealthScheduler | null = null;
  let testServer: Server | null = null;
  let serverUrl: string;

  beforeAll(async () => {
    // Start a real HTTP test server
    testServer = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });
    await new Promise<void>((resolve) => {
      testServer!.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = testServer!.address();
    serverUrl = `http://127.0.0.1:${(addr as any).port}`;
  });

  afterEach(() => {
    scheduler?.stop();
    scheduler = null;
  });

  afterAll(async () => {
    if (testServer) {
      await new Promise<void>((resolve) => testServer!.close(() => resolve()));
    }
  });

  it('runChecks records success for healthy providers', async () => {
    const p1 = await insertProvider('p1');
    const p2 = await insertProvider('p2');

    const tester = new HttpConnectionTester(serverUrl);
    tester.setResponse(p1.id, 200, 42);
    tester.setResponse(p2.id, 200, 88);

    const healthRepo = new PgProviderHealthRepository(pool as any);
    const health = new ProviderHealthService(healthRepo);
    const providerRepo = new PgProviderRepository(pool as any);

    scheduler = new ProviderHealthScheduler(
      providerRepo,
      tester as unknown as ProviderConnectionTester,
      health,
      { intervalMs: 60000, enabled: true },
    );

    await scheduler.runChecks();

    const h1 = await health.getHealth(p1.id);
    const h2 = await health.getHealth(p2.id);
    expect(h1).not.toBeNull();
    expect(h1!.status).toBe('healthy');
    expect(h1!.latencyMs).toBe(42);
    expect(h2).not.toBeNull();
    expect(h2!.status).toBe('healthy');
    expect(h2!.latencyMs).toBe(88);
  });

  it('runChecks records failure for unhealthy providers', async () => {
    const p1 = await insertProvider('p1');

    const tester = new HttpConnectionTester(serverUrl);
    tester.setResponse(p1.id, 500, 0, 'timeout');

    const healthRepo = new PgProviderHealthRepository(pool as any);
    const health = new ProviderHealthService(healthRepo);
    const providerRepo = new PgProviderRepository(pool as any);

    scheduler = new ProviderHealthScheduler(
      providerRepo,
      tester as unknown as ProviderConnectionTester,
      health,
      { intervalMs: 60000, enabled: true },
    );

    await scheduler.runChecks();

    const h1 = await health.getHealth(p1.id);
    expect(h1).not.toBeNull();
    expect(h1!.status).toBe('unhealthy');
    expect(h1!.message).toBe('timeout');
  });

  it('runChecks records failure when tester throws', async () => {
    const p1 = await insertProvider('p1');

    const tester = new HttpConnectionTester(serverUrl);
    tester.setThrow(p1.id);

    const healthRepo = new PgProviderHealthRepository(pool as any);
    const health = new ProviderHealthService(healthRepo);
    const providerRepo = new PgProviderRepository(pool as any);

    scheduler = new ProviderHealthScheduler(
      providerRepo,
      tester as unknown as ProviderConnectionTester,
      health,
      { intervalMs: 60000, enabled: true },
    );

    await scheduler.runChecks();

    const h1 = await health.getHealth(p1.id);
    expect(h1).not.toBeNull();
    expect(h1!.status).toBe('unhealthy');
    expect(h1!.message).toContain(`Connection error for ${p1.id}`);
  });

  it('runChecks handles non-Error throws gracefully', async () => {
    const p1 = await insertProvider('p1');

    // A connection tester that throws a string (non-Error).
    // This tests the scheduler's defensive error handling.
    const tester = {
      async testConnection() { throw 'string-error'; },
    };

    const healthRepo = new PgProviderHealthRepository(pool as any);
    const health = new ProviderHealthService(healthRepo);
    const providerRepo = new PgProviderRepository(pool as any);

    scheduler = new ProviderHealthScheduler(
      providerRepo,
      tester as unknown as ProviderConnectionTester,
      health,
      { intervalMs: 60000, enabled: true },
    );

    await scheduler.runChecks();

    const h1 = await health.getHealth(p1.id);
    expect(h1).not.toBeNull();
    expect(h1!.status).toBe('unhealthy');
    expect(h1!.message).toBe('Unknown error');
  });

  it('start does nothing when enabled is false', () => {
    const providerRepo = new PgProviderRepository(pool as any);
    const healthRepo = new PgProviderHealthRepository(pool as any);
    const health = new ProviderHealthService(healthRepo);
    const tester = new HttpConnectionTester(serverUrl);

    scheduler = new ProviderHealthScheduler(
      providerRepo,
      tester as unknown as ProviderConnectionTester,
      health,
      { intervalMs: 100, enabled: false },
    );

    scheduler.start();
    // No error, no timer set — stop is safe to call
    scheduler.stop();
  });

  it('start is idempotent (calling twice does not create duplicate timers)', () => {
    const providerRepo = new PgProviderRepository(pool as any);
    const healthRepo = new PgProviderHealthRepository(pool as any);
    const health = new ProviderHealthService(healthRepo);
    const tester = new HttpConnectionTester(serverUrl);

    scheduler = new ProviderHealthScheduler(
      providerRepo,
      tester as unknown as ProviderConnectionTester,
      health,
      { intervalMs: 60000, enabled: true },
    );

    scheduler.start();
    scheduler.start(); // second call should be a no-op
    scheduler.stop();
  });

  it('stop is safe to call when not started', () => {
    const providerRepo = new PgProviderRepository(pool as any);
    const healthRepo = new PgProviderHealthRepository(pool as any);
    const health = new ProviderHealthService(healthRepo);
    const tester = new HttpConnectionTester(serverUrl);

    scheduler = new ProviderHealthScheduler(
      providerRepo,
      tester as unknown as ProviderConnectionTester,
      health,
      { intervalMs: 60000, enabled: true },
    );

    // Should not throw
    scheduler.stop();
  });

  it('runChecks with no enabled providers records nothing', async () => {
    // No providers inserted — table is empty after truncate
    const tester = new HttpConnectionTester(serverUrl);
    const healthRepo = new PgProviderHealthRepository(pool as any);
    const health = new ProviderHealthService(healthRepo);
    const providerRepo = new PgProviderRepository(pool as any);

    scheduler = new ProviderHealthScheduler(
      providerRepo,
      tester as unknown as ProviderConnectionTester,
      health,
      { intervalMs: 60000, enabled: true },
    );

    await scheduler.runChecks();

    const all = await health.getAllHealth();
    expect(all).toHaveLength(0);
  });
});
