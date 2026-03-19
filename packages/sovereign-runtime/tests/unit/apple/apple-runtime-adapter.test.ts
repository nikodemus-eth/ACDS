import { describe, it, expect, beforeEach } from 'vitest';
import { AppleRuntimeAdapter } from '../../../src/providers/apple/apple-runtime-adapter.js';
import { MethodNotAvailableError, ProviderUnavailableError } from '../../../src/domain/errors.js';

describe('AppleRuntimeAdapter', () => {
  let adapter: AppleRuntimeAdapter;

  beforeEach(() => {
    adapter = new AppleRuntimeAdapter();
  });

  it('has correct provider ID', () => {
    expect(adapter.providerId).toBe('apple-intelligence-runtime');
  });

  it('is available by default', async () => {
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('health check returns healthy', async () => {
    const result = await adapter.healthCheck();
    expect(result.status).toBe('healthy');
    expect(result.details?.platform).toBe('darwin');
  });

  it('execute returns structured result with metadata', async () => {
    const result = await adapter.execute('apple.foundation_models.summarize', { text: 'Hello world' });
    expect(result.output).toBeDefined();
    expect(typeof result.latencyMs).toBe('number');
    expect(result.deterministic).toBe(true);
    expect(result.executionMode).toBe('local');
  });

  it('rejects unsupported method', async () => {
    await expect(
      adapter.execute('apple.vision.lidar', {}),
    ).rejects.toThrow(MethodNotAvailableError);
  });

  it('rejects completely unknown subsystem', async () => {
    await expect(
      adapter.execute('apple.quantum.entangle', {}),
    ).rejects.toThrow(MethodNotAvailableError);
  });

  it('throws PROVIDER_UNAVAILABLE when unavailable', async () => {
    adapter.setAvailable(false);
    await expect(
      adapter.execute('apple.foundation_models.summarize', { text: 'hi' }),
    ).rejects.toThrow(ProviderUnavailableError);
  });

  it('health check returns unavailable when set', async () => {
    adapter.setAvailable(false);
    const result = await adapter.healthCheck();
    expect(result.status).toBe('unavailable');
  });
});
