import { describe, it, expect } from 'vitest';
import { redactLogEvent, redactTokensInString } from '../../../src/telemetry/redaction.js';

describe('Redaction', () => {
  it('redacts known sensitive field names', () => {
    const event = {
      executionId: 'exec-001',
      apiKey: 'sk-abc123xyz456',
      authorization: 'Bearer token123',
      methodId: 'apple.vision.ocr',
    };

    const redacted = redactLogEvent(event);
    expect(redacted.apiKey).toBe('[REDACTED]');
    expect(redacted.authorization).toBe('[REDACTED]');
    expect(redacted.executionId).toBe('exec-001');
    expect(redacted.methodId).toBe('apple.vision.ocr');
  });

  it('redacts token-like strings in values', () => {
    const result = redactTokensInString('Using key sk-abc123def456ghi789jkl012mno345');
    expect(result).not.toContain('sk-abc123');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts Bearer tokens in strings', () => {
    const result = redactTokensInString('Authorization: Bearer eyJhbGciOi.eyJzdWIiOi.signature');
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('eyJhbGciOi');
  });

  it('preserves non-sensitive values', () => {
    const event = {
      methodId: 'apple.foundation_models.summarize',
      latencyMs: 15,
      status: 'success',
    };

    const redacted = redactLogEvent(event);
    expect(redacted.methodId).toBe('apple.foundation_models.summarize');
    expect(redacted.latencyMs).toBe(15);
    expect(redacted.status).toBe('success');
  });

  it('redacts nested objects', () => {
    const event = {
      executionId: 'exec-001',
      config: {
        apiKey: 'secret-key-value',
        baseUrl: 'http://localhost:11435',
      },
    };

    const redacted = redactLogEvent(event);
    expect((redacted.config as any).apiKey).toBe('[REDACTED]');
    expect((redacted.config as any).baseUrl).toBe('http://localhost:11435');
  });
});
