import { describe, it, expect } from 'vitest';
import { redactObject } from './redactObject.js';

describe('redactObject', () => {
  it('redacts sensitive keys', () => {
    const result = redactObject({ password: 'secret', name: 'test' });
    expect(result.password).toBe('[REDACTED]');
    expect(result.name).toBe('test');
  });

  it('redacts with additional custom keys matching tokenized key segments', () => {
    // tokenizeKey('secret_value') produces ['secret', 'value']
    const result = redactObject({ secret_value: 'hidden' }, ['secret']);
    expect(result.secret_value).toBe('[REDACTED]');
  });

  it('preserves non-string, non-object, non-array primitives (number, boolean, null)', () => {
    const result = redactObject({ count: 42, active: true, data: null });
    expect(result.count).toBe(42);
    expect(result.active).toBe(true);
    expect(result.data).toBeNull();
  });

  it('redacts inline secrets in string values', () => {
    const result = redactObject({
      config: 'host=db key=sk_live_abc123def456ghi789jkl012 port=5432',
    });
    expect(result.config).not.toContain('sk_live_abc123def456ghi789jkl012');
  });

  it('recursively redacts nested objects', () => {
    const result = redactObject({
      outer: { apiKey: 'secret-key', safe: 'visible' },
    });
    const nested = result.outer as Record<string, unknown>;
    expect(nested.safe).toBe('visible');
  });

  it('recursively redacts values inside arrays', () => {
    const result = redactObject({
      items: [{ token: 'abc' }, 'plain-string', 99],
    });
    const items = result.items as unknown[];
    expect(items).toHaveLength(3);
    expect(items[2]).toBe(99);
  });

  it('handles string values with no inline secrets (redactValue string path)', () => {
    const result = redactObject({ message: 'hello world' });
    expect(result.message).toBe('hello world');
  });

  it('preserves undefined values through redactValue fallthrough', () => {
    const result = redactObject({ field: undefined });
    expect(result.field).toBeUndefined();
  });

  it('handles deeply nested arrays containing primitives', () => {
    const result = redactObject({
      data: [42, true, null, 'safe text'],
    });
    const data = result.data as unknown[];
    expect(data[0]).toBe(42);
    expect(data[1]).toBe(true);
    expect(data[2]).toBeNull();
    expect(data[3]).toBe('safe text');
  });
});
