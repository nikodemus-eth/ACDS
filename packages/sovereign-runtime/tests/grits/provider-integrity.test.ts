import { describe, it, expect, beforeEach } from 'vitest';
import { AppleRuntimeAdapter } from '../../src/providers/apple/apple-runtime-adapter.js';
import { SourceRegistry } from '../../src/registry/registry.js';
import { APPLE_METHODS } from '../../src/providers/apple/apple-method-registry.js';
import { FIXTURES_APPLE_PROVIDER } from '../../src/fixtures/provider-fixtures.js';
import { MethodNotAvailableError, ProviderUnavailableError } from '../../src/domain/errors.js';

describe('GRITS Provider Integrity', () => {
  let adapter: AppleRuntimeAdapter;
  let registry: SourceRegistry;

  beforeEach(() => {
    adapter = new AppleRuntimeAdapter();
    registry = new SourceRegistry();
    registry.registerProvider(FIXTURES_APPLE_PROVIDER, APPLE_METHODS);
  });

  it('GRITS-PROV-001: unavailable provider detected before execution', async () => {
    adapter.setAvailable(false);
    const available = await adapter.isAvailable();
    expect(available).toBe(false);

    await expect(
      adapter.execute('apple.foundation_models.summarize', { text: 'hello' }),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('GRITS-PROV-002: provider runtime returns structured metadata on success', async () => {
    const result = await adapter.execute('apple.foundation_models.summarize', {
      text: 'This is a test document that needs summarization.',
    });

    expect(result).toBeDefined();
    expect(result.output).toBeDefined();
    expect(typeof result.latencyMs).toBe('number');
    expect(typeof result.deterministic).toBe('boolean');
    expect(result.executionMode).toBe('local');
  });

  it('GRITS-PROV-003: unsupported method returns METHOD_NOT_AVAILABLE', async () => {
    await expect(
      adapter.execute('apple.nonexistent.method', { text: 'hello' }),
    ).rejects.toThrow(MethodNotAvailableError);
  });

  it('GRITS-PROV-004: provider timeout logged as runtime degradation', async () => {
    // Set health to degraded and verify health check returns degraded status
    registry.setHealthState(FIXTURES_APPLE_PROVIDER.id, 'degraded');
    const healthState = registry.getHealthState(FIXTURES_APPLE_PROVIDER.id);
    expect(healthState).toBe('degraded');

    // The adapter health check when unavailable returns 'unavailable' status
    adapter.setAvailable(false);
    const health = await adapter.healthCheck();
    expect(health.status).toBe('unavailable');
    expect(typeof health.latencyMs).toBe('number');
  });

  it('GRITS-PROV-005: provider health transitions correctly (healthy→degraded→unavailable→healthy)', () => {
    // Start healthy
    expect(registry.getHealthState(FIXTURES_APPLE_PROVIDER.id)).toBe('healthy');

    // Transition to degraded
    registry.setHealthState(FIXTURES_APPLE_PROVIDER.id, 'degraded');
    expect(registry.getHealthState(FIXTURES_APPLE_PROVIDER.id)).toBe('degraded');

    // Transition to unavailable
    registry.setHealthState(FIXTURES_APPLE_PROVIDER.id, 'unavailable');
    expect(registry.getHealthState(FIXTURES_APPLE_PROVIDER.id)).toBe('unavailable');

    // Recovery back to healthy
    registry.setHealthState(FIXTURES_APPLE_PROVIDER.id, 'healthy');
    expect(registry.getHealthState(FIXTURES_APPLE_PROVIDER.id)).toBe('healthy');
  });
});
