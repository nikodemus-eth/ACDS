import { describe, it, expect } from 'vitest';
import { normalizeExecutionFailure } from './ExecutionFailureNormalizer.js';

describe('normalizeExecutionFailure', () => {
  it('normalizes a plain Error into a failure with code UNKNOWN', () => {
    const error = new Error('something broke');
    const result = normalizeExecutionFailure(error);

    expect(result.code).toBe('UNKNOWN');
    expect(result.message).toBe('something broke');
    expect(result.providerId).toBeNull();
    expect(result.retryable).toBe(false);
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it('extracts a custom code property from an Error', () => {
    const error = Object.assign(new Error('rate limited'), { code: 'RATE_LIMIT' });
    const result = normalizeExecutionFailure(error, 'openai');

    expect(result.code).toBe('RATE_LIMIT');
    expect(result.message).toBe('rate limited');
    expect(result.providerId).toBe('openai');
  });

  it('extracts a retryable property from an Error', () => {
    const error = Object.assign(new Error('timeout'), { retryable: true });
    const result = normalizeExecutionFailure(error);

    expect(result.retryable).toBe(true);
  });

  it('uses providerId when supplied with an Error', () => {
    const error = new Error('fail');
    const result = normalizeExecutionFailure(error, 'anthropic');

    expect(result.providerId).toBe('anthropic');
  });

  it('normalizes a string error', () => {
    const result = normalizeExecutionFailure('string error');

    expect(result.code).toBe('UNKNOWN');
    expect(result.message).toBe('string error');
    expect(result.providerId).toBeNull();
    expect(result.retryable).toBe(false);
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it('normalizes a number error', () => {
    const result = normalizeExecutionFailure(42, 'prov-1');

    expect(result.code).toBe('UNKNOWN');
    expect(result.message).toBe('42');
    expect(result.providerId).toBe('prov-1');
    expect(result.retryable).toBe(false);
  });

  it('normalizes null error', () => {
    const result = normalizeExecutionFailure(null);

    expect(result.code).toBe('UNKNOWN');
    expect(result.message).toBe('null');
    expect(result.retryable).toBe(false);
  });

  it('normalizes undefined error', () => {
    const result = normalizeExecutionFailure(undefined);

    expect(result.code).toBe('UNKNOWN');
    expect(result.message).toBe('undefined');
  });

  it('normalizes an object error', () => {
    const result = normalizeExecutionFailure({ foo: 'bar' });

    expect(result.code).toBe('UNKNOWN');
    expect(result.message).toBe('[object Object]');
  });

  it('defaults providerId to null when not supplied for non-Error', () => {
    const result = normalizeExecutionFailure('oops');
    expect(result.providerId).toBeNull();
  });

  it('defaults retryable to false when Error lacks retryable property', () => {
    const error = new Error('plain');
    const result = normalizeExecutionFailure(error);
    expect(result.retryable).toBe(false);
  });

  it('defaults code to UNKNOWN when Error lacks code property', () => {
    const error = new Error('no code');
    const result = normalizeExecutionFailure(error);
    expect(result.code).toBe('UNKNOWN');
  });
});
