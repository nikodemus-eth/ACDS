import { describe, it, expect } from 'vitest';
import { redactLogEvent, redactTokensInString } from './redaction.js';

describe('Redaction', () => {
  it('redacts known sensitive field names', () => {
    const event = { executionId: 'exec-001', apiKey: 'sk-abc123xyz456', authorization: 'Bearer token123', methodId: 'apple.vision.ocr' };
    const redacted = redactLogEvent(event);
    expect(redacted.apiKey).toBe('[REDACTED]');
    expect(redacted.authorization).toBe('[REDACTED]');
    expect(redacted.executionId).toBe('exec-001');
    expect(redacted.methodId).toBe('apple.vision.ocr');
  });

  it('redacts all sensitive field name variants', () => {
    const event = { secret: 'x', token: 'y', password: 'z', auth: 'a', credential: 'b', credentials: 'c', private_key: 'd', privatekey: 'e', api_key: 'f' };
    const redacted = redactLogEvent(event);
    for (const key of Object.keys(event)) {
      expect(redacted[key as keyof typeof redacted]).toBe('[REDACTED]');
    }
  });

  it('redacts OpenAI-style tokens in strings', () => {
    const result = redactTokensInString('Using key sk-abc123def456ghi789jkl012mno345');
    expect(result).not.toContain('sk-abc123');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts Bearer tokens in strings', () => {
    const result = redactTokensInString('Authorization: Bearer eyJhbGciOi.eyJzdWIiOi.signature');
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('eyJhbGciOi');
  });

  it('redacts GitHub tokens', () => {
    const result = redactTokensInString('Token: ghp_' + 'a'.repeat(36));
    expect(result).toContain('[REDACTED]');
  });

  it('preserves non-sensitive values', () => {
    const event = { methodId: 'test', latencyMs: 15, status: 'success' };
    const redacted = redactLogEvent(event);
    expect(redacted.methodId).toBe('test');
    expect(redacted.latencyMs).toBe(15);
    expect(redacted.status).toBe('success');
  });

  it('redacts nested objects', () => {
    const event = { config: { apiKey: 'secret', baseUrl: 'http://localhost' } };
    const redacted = redactLogEvent(event);
    expect((redacted.config as any).apiKey).toBe('[REDACTED]');
    expect((redacted.config as any).baseUrl).toBe('http://localhost');
  });

  it('preserves arrays', () => {
    const event = { tags: ['a', 'b'] };
    const redacted = redactLogEvent(event);
    expect(redacted.tags).toEqual(['a', 'b']);
  });

  it('preserves null values', () => {
    const event = { value: null };
    const redacted = redactLogEvent(event);
    expect(redacted.value).toBeNull();
  });
});
