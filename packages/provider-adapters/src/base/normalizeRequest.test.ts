import { describe, it, expect } from 'vitest';
import { normalizeRequest } from './normalizeRequest.js';

describe('normalizeRequest', () => {
  it('returns all fields when fully specified', () => {
    const result = normalizeRequest({
      prompt: 'hello',
      model: 'gpt-4',
      systemPrompt: 'You are helpful',
      temperature: 0.5,
      maxTokens: 1024,
      topP: 0.9,
      stopSequences: ['END'],
      responseFormat: 'json',
    });

    expect(result).toEqual({
      prompt: 'hello',
      model: 'gpt-4',
      systemPrompt: 'You are helpful',
      temperature: 0.5,
      maxTokens: 1024,
      topP: 0.9,
      stopSequences: ['END'],
      responseFormat: 'json',
    });
  });

  it('applies default temperature of 0.7 when not provided', () => {
    const result = normalizeRequest({ prompt: 'test', model: 'gpt-4' });
    expect(result.temperature).toBe(0.7);
  });

  it('applies default maxTokens of 2048 when not provided', () => {
    const result = normalizeRequest({ prompt: 'test', model: 'gpt-4' });
    expect(result.maxTokens).toBe(2048);
  });

  it('applies default responseFormat of text when not provided', () => {
    const result = normalizeRequest({ prompt: 'test', model: 'gpt-4' });
    expect(result.responseFormat).toBe('text');
  });

  it('leaves optional fields undefined when not provided', () => {
    const result = normalizeRequest({ prompt: 'test', model: 'gpt-4' });
    expect(result.systemPrompt).toBeUndefined();
    expect(result.topP).toBeUndefined();
    expect(result.stopSequences).toBeUndefined();
  });

  it('preserves explicit temperature of 0', () => {
    const result = normalizeRequest({ prompt: 'test', model: 'gpt-4', temperature: 0 });
    expect(result.temperature).toBe(0);
  });

  it('preserves explicit maxTokens of 0', () => {
    const result = normalizeRequest({ prompt: 'test', model: 'gpt-4', maxTokens: 0 });
    // 0 is falsy but not nullish, so ?? should preserve it
    expect(result.maxTokens).toBe(0);
  });

  it('preserves responseFormat json', () => {
    const result = normalizeRequest({ prompt: 'test', model: 'gpt-4', responseFormat: 'json' });
    expect(result.responseFormat).toBe('json');
  });

  it('preserves empty stopSequences array', () => {
    const result = normalizeRequest({ prompt: 'test', model: 'gpt-4', stopSequences: [] });
    expect(result.stopSequences).toEqual([]);
  });
});
