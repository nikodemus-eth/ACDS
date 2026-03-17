import { describe, it, expect, afterEach } from 'vitest';
import { ProviderHealthScheduler } from './ProviderHealthScheduler.js';
import type { ProviderRepository } from '../registry/ProviderRepository.js';
import type { ProviderConnectionTester } from '../execution/ProviderConnectionTester.js';
import type { ProviderHealthService } from './ProviderHealthService.js';
import type { Provider } from '@acds/core-types';
import { ProviderVendor, AuthType } from '@acds/core-types';

function makeProvider(id: string): Provider {
  return {
    id,
    name: `Provider ${id}`,
    vendor: ProviderVendor.OPENAI,
    authType: AuthType.API_KEY,
    baseUrl: 'https://api.example.com',
    enabled: true,
    environment: 'test',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

class InMemoryProviderRepository implements ProviderRepository {
  private providers: Provider[] = [];

  setProviders(providers: Provider[]) {
    this.providers = providers;
  }

  async create(input: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>): Promise<Provider> {
    const p: Provider = { ...input, id: `gen-${Date.now()}`, createdAt: new Date(), updatedAt: new Date() };
    this.providers.push(p);
    return p;
  }
  async findById(id: string): Promise<Provider | null> {
    return this.providers.find(p => p.id === id) ?? null;
  }
  async findAll(): Promise<Provider[]> { return this.providers; }
  async findByVendor(vendor: string): Promise<Provider[]> {
    return this.providers.filter(p => p.vendor === vendor);
  }
  async findEnabled(): Promise<Provider[]> {
    return this.providers.filter(p => p.enabled);
  }
  async update(id: string, updates: Partial<Omit<Provider, 'id' | 'createdAt'>>): Promise<Provider> {
    const p = this.providers.find(p => p.id === id)!;
    Object.assign(p, updates, { updatedAt: new Date() });
    return p;
  }
  async disable(id: string): Promise<Provider> {
    return this.update(id, { enabled: false });
  }
  async delete(id: string): Promise<void> {
    this.providers = this.providers.filter(p => p.id !== id);
  }
}

class InMemoryConnectionTester implements Pick<ProviderConnectionTester, 'testConnection'> {
  results = new Map<string, { success: boolean; latencyMs: number; message: string }>();
  throwFor = new Set<string>();

  async testConnection(provider: Provider) {
    if (this.throwFor.has(provider.id)) {
      throw new Error(`Connection error for ${provider.id}`);
    }
    return this.results.get(provider.id) ?? { success: true, latencyMs: 50, message: 'ok' };
  }
}

class InMemoryHealthService implements Pick<ProviderHealthService, 'recordSuccess' | 'recordFailure'> {
  successes: { providerId: string; latencyMs: number }[] = [];
  failures: { providerId: string; message: string }[] = [];

  async recordSuccess(providerId: string, latencyMs: number): Promise<void> {
    this.successes.push({ providerId, latencyMs });
  }
  async recordFailure(providerId: string, message: string): Promise<void> {
    this.failures.push({ providerId, message });
  }
}

describe('ProviderHealthScheduler', () => {
  let scheduler: ProviderHealthScheduler | null = null;

  afterEach(() => {
    scheduler?.stop();
    scheduler = null;
  });

  it('runChecks records success for healthy providers', async () => {
    const repo = new InMemoryProviderRepository();
    repo.setProviders([makeProvider('p1'), makeProvider('p2')]);

    const tester = new InMemoryConnectionTester();
    tester.results.set('p1', { success: true, latencyMs: 42, message: 'ok' });
    tester.results.set('p2', { success: true, latencyMs: 88, message: 'ok' });

    const health = new InMemoryHealthService();

    scheduler = new ProviderHealthScheduler(
      repo,
      tester as unknown as ProviderConnectionTester,
      health as unknown as ProviderHealthService,
      { intervalMs: 60000, enabled: true },
    );

    await scheduler.runChecks();

    expect(health.successes).toHaveLength(2);
    expect(health.successes[0]!.providerId).toBe('p1');
    expect(health.successes[0]!.latencyMs).toBe(42);
    expect(health.successes[1]!.providerId).toBe('p2');
  });

  it('runChecks records failure for unhealthy providers', async () => {
    const repo = new InMemoryProviderRepository();
    repo.setProviders([makeProvider('p1')]);

    const tester = new InMemoryConnectionTester();
    tester.results.set('p1', { success: false, latencyMs: 0, message: 'timeout' });

    const health = new InMemoryHealthService();

    scheduler = new ProviderHealthScheduler(
      repo,
      tester as unknown as ProviderConnectionTester,
      health as unknown as ProviderHealthService,
      { intervalMs: 60000, enabled: true },
    );

    await scheduler.runChecks();

    expect(health.failures).toHaveLength(1);
    expect(health.failures[0]!.message).toBe('timeout');
  });

  it('runChecks records failure when tester throws', async () => {
    const repo = new InMemoryProviderRepository();
    repo.setProviders([makeProvider('p1')]);

    const tester = new InMemoryConnectionTester();
    tester.throwFor.add('p1');

    const health = new InMemoryHealthService();

    scheduler = new ProviderHealthScheduler(
      repo,
      tester as unknown as ProviderConnectionTester,
      health as unknown as ProviderHealthService,
      { intervalMs: 60000, enabled: true },
    );

    await scheduler.runChecks();

    expect(health.failures).toHaveLength(1);
    expect(health.failures[0]!.message).toContain('Connection error for p1');
  });

  it('runChecks handles non-Error throws gracefully', async () => {
    const repo = new InMemoryProviderRepository();
    repo.setProviders([makeProvider('p1')]);

    const tester = {
      async testConnection() { throw 'string-error'; },
    };

    const health = new InMemoryHealthService();

    scheduler = new ProviderHealthScheduler(
      repo,
      tester as unknown as ProviderConnectionTester,
      health as unknown as ProviderHealthService,
      { intervalMs: 60000, enabled: true },
    );

    await scheduler.runChecks();

    expect(health.failures).toHaveLength(1);
    expect(health.failures[0]!.message).toBe('Unknown error');
  });

  it('start does nothing when enabled is false', () => {
    const repo = new InMemoryProviderRepository();
    const tester = new InMemoryConnectionTester();
    const health = new InMemoryHealthService();

    scheduler = new ProviderHealthScheduler(
      repo,
      tester as unknown as ProviderConnectionTester,
      health as unknown as ProviderHealthService,
      { intervalMs: 100, enabled: false },
    );

    scheduler.start();
    // No error, no timer set — stop is safe to call
    scheduler.stop();
  });

  it('start is idempotent (calling twice does not create duplicate timers)', () => {
    const repo = new InMemoryProviderRepository();
    const tester = new InMemoryConnectionTester();
    const health = new InMemoryHealthService();

    scheduler = new ProviderHealthScheduler(
      repo,
      tester as unknown as ProviderConnectionTester,
      health as unknown as ProviderHealthService,
      { intervalMs: 60000, enabled: true },
    );

    scheduler.start();
    scheduler.start(); // second call should be a no-op
    scheduler.stop();
  });

  it('stop is safe to call when not started', () => {
    const repo = new InMemoryProviderRepository();
    const tester = new InMemoryConnectionTester();
    const health = new InMemoryHealthService();

    scheduler = new ProviderHealthScheduler(
      repo,
      tester as unknown as ProviderConnectionTester,
      health as unknown as ProviderHealthService,
      { intervalMs: 60000, enabled: true },
    );

    // Should not throw
    scheduler.stop();
  });

  it('runChecks with no enabled providers records nothing', async () => {
    const repo = new InMemoryProviderRepository();
    repo.setProviders([]);

    const tester = new InMemoryConnectionTester();
    const health = new InMemoryHealthService();

    scheduler = new ProviderHealthScheduler(
      repo,
      tester as unknown as ProviderConnectionTester,
      health as unknown as ProviderHealthService,
      { intervalMs: 60000, enabled: true },
    );

    await scheduler.runChecks();

    expect(health.successes).toHaveLength(0);
    expect(health.failures).toHaveLength(0);
  });
});
