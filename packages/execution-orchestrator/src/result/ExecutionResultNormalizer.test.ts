import { describe, it, expect } from 'vitest';
import { normalizeExecutionResult } from './ExecutionResultNormalizer.js';

function makeResponse(overrides: Record<string, unknown> = {}) {
  return {
    content: 'Hello world',
    model: 'gpt-4',
    inputTokens: 100,
    outputTokens: 50,
    finishReason: 'stop' as const,
    latencyMs: 250,
    ...overrides,
  };
}

describe('normalizeExecutionResult', () => {
  it('normalizes a complete adapter response', () => {
    const response = makeResponse();
    const result = normalizeExecutionResult(response);

    expect(result.content).toBe('Hello world');
    expect(result.model).toBe('gpt-4');
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
    expect(result.finishReason).toBe('stop');
    expect(result.latencyMs).toBe(250);
  });

  it('preserves null token counts', () => {
    const response = makeResponse({ inputTokens: null, outputTokens: null });
    const result = normalizeExecutionResult(response);

    expect(result.inputTokens).toBeNull();
    expect(result.outputTokens).toBeNull();
  });

  it('handles different finish reasons', () => {
    for (const reason of ['stop', 'length', 'error', 'unknown'] as const) {
      const result = normalizeExecutionResult(makeResponse({ finishReason: reason }));
      expect(result.finishReason).toBe(reason);
    }
  });

  it('handles zero latency', () => {
    const result = normalizeExecutionResult(makeResponse({ latencyMs: 0 }));
    expect(result.latencyMs).toBe(0);
  });

  it('handles empty content', () => {
    const result = normalizeExecutionResult(makeResponse({ content: '' }));
    expect(result.content).toBe('');
  });

  it('does not include rawMetadata in normalized result', () => {
    const response = makeResponse({ rawMetadata: { extra: 'data' } });
    const result = normalizeExecutionResult(response);

    expect(result).not.toHaveProperty('rawMetadata');
    expect(Object.keys(result)).toEqual([
      'content', 'model', 'inputTokens', 'outputTokens', 'finishReason', 'latencyMs',
    ]);
  });
});
