import { describe, it, expect } from 'vitest';
import { redactError } from './redactError.js';

describe('redactError', () => {
  it('redacts inline secrets from Error message', () => {
    const err = new Error('Failed with api_key=sk-abc123def and token=xyz');
    const result = redactError(err);

    expect(result.message).not.toContain('sk-abc123def');
    expect(result.message).toContain('[REDACTED]');
  });

  it('preserves error code if present', () => {
    const err = Object.assign(new Error('something failed'), { code: 'ECONNREFUSED' });
    const result = redactError(err);

    expect(result.code).toBe('ECONNREFUSED');
    expect(result.message).toBe('something failed');
  });

  it('returns undefined code when error has no code', () => {
    const err = new Error('no code here');
    const result = redactError(err);

    expect(result.code).toBeUndefined();
  });

  it('handles non-Error values with a generic message', () => {
    const result = redactError('string error');
    expect(result.message).toBe('An unknown error occurred');
  });

  it('handles null', () => {
    const result = redactError(null);
    expect(result.message).toBe('An unknown error occurred');
  });

  it('handles undefined', () => {
    const result = redactError(undefined);
    expect(result.message).toBe('An unknown error occurred');
  });

  it('handles number', () => {
    const result = redactError(42);
    expect(result.message).toBe('An unknown error occurred');
  });

  it('handles object that is not an Error', () => {
    const result = redactError({ foo: 'bar' });
    expect(result.message).toBe('An unknown error occurred');
  });

  it('redacts Bearer tokens in error messages', () => {
    const err = new Error('Auth failed: Bearer eyJhbGciOiJIUzI1NiJ9.payload');
    const result = redactError(err);

    expect(result.message).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(result.message).toContain('Bearer [REDACTED]');
  });

  it('redacts Basic auth in error messages', () => {
    const err = new Error('Auth failed: Basic dXNlcjpwYXNz');
    const result = redactError(err);

    expect(result.message).toContain('Basic [REDACTED]');
  });

  it('redacts sk- prefixed keys in error messages', () => {
    const err = new Error('Invalid key: sk-proj-abc123xyz');
    const result = redactError(err);

    expect(result.message).not.toContain('sk-proj-abc123xyz');
    expect(result.message).toContain('[REDACTED]');
  });

  it('redacts URLs with credentials in error messages', () => {
    const err = new Error('Connection to https://user:pass@host.com/api failed');
    const result = redactError(err);

    expect(result.message).not.toContain('user:pass');
    expect(result.message).toContain('[REDACTED]');
  });
});
