import { describe, it, expect } from 'vitest';
import { redactHeaders } from './redactHeaders.js';

describe('redactHeaders', () => {
  it('redacts standard sensitive headers', () => {
    const result = redactHeaders({
      authorization: 'Bearer token',
      'x-api-key': 'my-key',
      'content-type': 'application/json',
    });
    expect(result.authorization).toBe('[REDACTED]');
    expect(result['x-api-key']).toBe('[REDACTED]');
    expect(result['content-type']).toBe('application/json');
  });

  it('redacts cookie and set-cookie headers', () => {
    const result = redactHeaders({
      cookie: 'session=abc',
      'set-cookie': 'id=123',
    });
    expect(result.cookie).toBe('[REDACTED]');
    expect(result['set-cookie']).toBe('[REDACTED]');
  });

  it('redacts additional custom headers', () => {
    const result = redactHeaders(
      { 'x-custom-secret': 'hidden', host: 'example.com' },
      ['x-custom-secret'],
    );
    expect(result['x-custom-secret']).toBe('[REDACTED]');
    expect(result.host).toBe('example.com');
  });

  it('is case-insensitive for header matching', () => {
    const result = redactHeaders({ Authorization: 'Bearer abc' });
    expect(result.Authorization).toBe('[REDACTED]');
  });

  it('preserves undefined values for non-sensitive headers', () => {
    const result = redactHeaders({ 'x-trace': undefined });
    expect(result['x-trace']).toBeUndefined();
  });

  it('redacts array-valued sensitive headers', () => {
    const result = redactHeaders({
      'set-cookie': ['session=abc', 'id=123'] as any,
    });
    expect(result['set-cookie']).toBe('[REDACTED]');
  });

  it('preserves non-sensitive headers with array values', () => {
    const result = redactHeaders({
      'x-custom': ['val1', 'val2'] as any,
    });
    expect(result['x-custom']).toEqual(['val1', 'val2']);
  });
});
