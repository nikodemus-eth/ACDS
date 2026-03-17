import { describe, it, expect } from 'vitest';
import { ProviderExecutionError } from './ProviderExecutionError.js';

describe('ProviderExecutionError', () => {
  it('sets name to ProviderExecutionError', () => {
    const err = new ProviderExecutionError({
      message: 'test',
      code: 'TEST',
    });
    expect(err.name).toBe('ProviderExecutionError');
  });

  it('stores message, code, and providerId', () => {
    const err = new ProviderExecutionError({
      message: 'Provider failed',
      code: 'EXECUTION_FAILED',
      providerId: 'prov-1',
    });
    expect(err.message).toBe('Provider failed');
    expect(err.code).toBe('EXECUTION_FAILED');
    expect(err.providerId).toBe('prov-1');
  });

  it('defaults retryable to false', () => {
    const err = new ProviderExecutionError({
      message: 'test',
      code: 'TEST',
    });
    expect(err.retryable).toBe(false);
  });

  it('accepts retryable = true', () => {
    const err = new ProviderExecutionError({
      message: 'test',
      code: 'TEST',
      retryable: true,
    });
    expect(err.retryable).toBe(true);
  });

  it('stores cause error', () => {
    const cause = new Error('root cause');
    const err = new ProviderExecutionError({
      message: 'wrapped',
      code: 'WRAP',
      cause,
    });
    expect(err.cause).toBe(cause);
  });

  it('is an instance of Error', () => {
    const err = new ProviderExecutionError({
      message: 'test',
      code: 'TEST',
    });
    expect(err).toBeInstanceOf(Error);
  });

  it('providerId is undefined when not provided', () => {
    const err = new ProviderExecutionError({
      message: 'test',
      code: 'TEST',
    });
    expect(err.providerId).toBeUndefined();
  });
});
