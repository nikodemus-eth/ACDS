import { describe, it, expect } from 'vitest';
import { normalizeResponse } from './normalizeResponse.js';

describe('normalizeResponse', () => {
  const baseInput = {
    content: 'Hello world',
    model: 'gpt-4',
    latencyMs: 150,
  };

  it('maps stop finishReason correctly', () => {
    const result = normalizeResponse({ ...baseInput, finishReason: 'stop' });
    expect(result.finishReason).toBe('stop');
  });

  it('maps length finishReason correctly', () => {
    const result = normalizeResponse({ ...baseInput, finishReason: 'length' });
    expect(result.finishReason).toBe('length');
  });

  it('maps error finishReason correctly', () => {
    const result = normalizeResponse({ ...baseInput, finishReason: 'error' });
    expect(result.finishReason).toBe('error');
  });

  it('maps unknown finishReason to unknown', () => {
    const result = normalizeResponse({ ...baseInput, finishReason: 'content_filter' });
    expect(result.finishReason).toBe('unknown');
  });

  it('maps undefined finishReason to unknown', () => {
    const result = normalizeResponse({ ...baseInput });
    expect(result.finishReason).toBe('unknown');
  });

  it('defaults inputTokens to null when not provided', () => {
    const result = normalizeResponse({ ...baseInput });
    expect(result.inputTokens).toBeNull();
  });

  it('defaults outputTokens to null when not provided', () => {
    const result = normalizeResponse({ ...baseInput });
    expect(result.outputTokens).toBeNull();
  });

  it('defaults inputTokens to null when null', () => {
    const result = normalizeResponse({ ...baseInput, inputTokens: null });
    expect(result.inputTokens).toBeNull();
  });

  it('defaults outputTokens to null when null', () => {
    const result = normalizeResponse({ ...baseInput, outputTokens: null });
    expect(result.outputTokens).toBeNull();
  });

  it('preserves numeric token counts', () => {
    const result = normalizeResponse({ ...baseInput, inputTokens: 100, outputTokens: 200 });
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(200);
  });

  it('preserves zero token counts', () => {
    const result = normalizeResponse({ ...baseInput, inputTokens: 0, outputTokens: 0 });
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });

  it('passes through content and model', () => {
    const result = normalizeResponse({ ...baseInput });
    expect(result.content).toBe('Hello world');
    expect(result.model).toBe('gpt-4');
  });

  it('passes through latencyMs', () => {
    const result = normalizeResponse({ ...baseInput, latencyMs: 999 });
    expect(result.latencyMs).toBe(999);
  });

  it('passes through rawMetadata when provided', () => {
    const meta = { usage: { total: 300 } };
    const result = normalizeResponse({ ...baseInput, rawMetadata: meta });
    expect(result.rawMetadata).toEqual(meta);
  });

  it('leaves rawMetadata undefined when not provided', () => {
    const result = normalizeResponse({ ...baseInput });
    expect(result.rawMetadata).toBeUndefined();
  });
});
