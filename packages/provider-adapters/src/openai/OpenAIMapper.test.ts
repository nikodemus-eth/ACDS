import { describe, it, expect } from 'vitest';
import { toOpenAIRequest, fromOpenAIResponse } from './OpenAIMapper.js';
import type { AdapterRequest } from '../base/AdapterTypes.js';

describe('OpenAIMapper', () => {
  describe('toOpenAIRequest', () => {
    it('maps a full AdapterRequest with system prompt to OpenAI format', () => {
      const request: AdapterRequest = {
        prompt: 'Hello',
        model: 'gpt-4',
        systemPrompt: 'You are helpful',
        temperature: 0.5,
        maxTokens: 512,
        topP: 0.9,
        stopSequences: ['END'],
        responseFormat: 'json',
      };
      const result = toOpenAIRequest(request);
      expect(result.model).toBe('gpt-4');
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toEqual({ role: 'system', content: 'You are helpful' });
      expect(result.messages[1]).toEqual({ role: 'user', content: 'Hello' });
      expect(result.temperature).toBe(0.5);
      expect(result.max_tokens).toBe(512);
      expect(result.top_p).toBe(0.9);
      expect(result.stop).toEqual(['END']);
      expect(result.response_format).toEqual({ type: 'json_object' });
    });

    it('maps a minimal AdapterRequest without system prompt', () => {
      const request: AdapterRequest = { prompt: 'Hi', model: 'gpt-3.5-turbo' };
      const result = toOpenAIRequest(request);
      expect(result.model).toBe('gpt-3.5-turbo');
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toEqual({ role: 'user', content: 'Hi' });
      expect(result.stop).toBeNull();
      expect(result.response_format).toBeUndefined();
    });

    it('sets response_format to undefined for text format', () => {
      const request: AdapterRequest = { prompt: 'Hi', model: 'gpt-4', responseFormat: 'text' };
      const result = toOpenAIRequest(request);
      expect(result.response_format).toBeUndefined();
    });

    it('sets stop to null when no stop sequences provided', () => {
      const request: AdapterRequest = { prompt: 'Hi', model: 'gpt-4' };
      const result = toOpenAIRequest(request);
      expect(result.stop).toBeNull();
    });

    it('passes through stop sequences when provided', () => {
      const request: AdapterRequest = { prompt: 'Hi', model: 'gpt-4', stopSequences: ['<|end|>'] };
      const result = toOpenAIRequest(request);
      expect(result.stop).toEqual(['<|end|>']);
    });
  });

  describe('fromOpenAIResponse', () => {
    it('maps a complete OpenAI response', () => {
      const result = fromOpenAIResponse({
        id: 'chatcmpl-1',
        model: 'gpt-4',
        choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }, 150);
      expect(result.content).toBe('Hello!');
      expect(result.model).toBe('gpt-4');
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(5);
      expect(result.finishReason).toBe('stop');
      expect(result.latencyMs).toBe(150);
    });

    it('maps finish_reason length correctly', () => {
      const result = fromOpenAIResponse({
        id: 'chatcmpl-2',
        model: 'gpt-4',
        choices: [{ message: { content: 'partial' }, finish_reason: 'length' }],
      }, 10);
      expect(result.finishReason).toBe('length');
    });

    it('maps unknown finish_reason to unknown', () => {
      const result = fromOpenAIResponse({
        id: 'chatcmpl-3',
        model: 'gpt-4',
        choices: [{ message: { content: 'ok' }, finish_reason: 'content_filter' }],
      }, 10);
      expect(result.finishReason).toBe('unknown');
    });

    it('defaults token counts to null when usage is missing', () => {
      const result = fromOpenAIResponse({
        id: 'chatcmpl-4',
        model: 'gpt-4',
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      }, 10);
      expect(result.inputTokens).toBeNull();
      expect(result.outputTokens).toBeNull();
    });

    it('handles empty choices array', () => {
      const result = fromOpenAIResponse({
        id: 'chatcmpl-5',
        model: 'gpt-4',
        choices: [],
      }, 10);
      expect(result.content).toBe('');
      expect(result.finishReason).toBe('unknown');
    });
  });
});
