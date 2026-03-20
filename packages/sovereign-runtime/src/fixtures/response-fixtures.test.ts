import { describe, it, expect } from 'vitest';
import { makeSuccessResponse } from './response-fixtures.js';

describe('Response Fixtures', () => {
  it('makeSuccessResponse returns default metadata', () => {
    const response = makeSuccessResponse();
    expect(response.output).toEqual({ result: 'test output' });
    expect(response.metadata.providerId).toBe('apple-intelligence-runtime');
    expect(response.metadata.methodId).toBe('apple.foundation_models.summarize');
    expect(response.metadata.executionMode).toBe('local');
    expect(response.metadata.deterministic).toBe(true);
    expect(response.metadata.latencyMs).toBe(15);
    expect(response.metadata.validated).toBe(true);
  });

  it('makeSuccessResponse applies overrides', () => {
    const response = makeSuccessResponse({ latencyMs: 500, providerId: 'ollama-local' });
    expect(response.metadata.latencyMs).toBe(500);
    expect(response.metadata.providerId).toBe('ollama-local');
  });
});
