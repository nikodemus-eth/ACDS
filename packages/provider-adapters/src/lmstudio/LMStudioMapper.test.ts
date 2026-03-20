import { describe, it, expect } from 'vitest';
import { toLMStudioRequest, fromLMStudioResponse } from './LMStudioMapper.js';
import type { AdapterRequest } from '../base/AdapterTypes.js';

describe('LMStudioMapper', () => {
  describe('toLMStudioRequest', () => {
    it('maps a full AdapterRequest with system prompt', () => {
      const request: AdapterRequest = {
        prompt: 'Hello',
        model: 'local-model',
        systemPrompt: 'You are helpful',
        temperature: 0.5,
        maxTokens: 512,
        topP: 0.9,
        stopSequences: ['END'],
        responseFormat: 'json',
      };
      const result = toLMStudioRequest(request);
      expect(result.model).toBe('local-model');
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
      const request: AdapterRequest = { prompt: 'Hi', model: 'local-model' };
      const result = toLMStudioRequest(request);
      expect(result.model).toBe('local-model');
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toEqual({ role: 'user', content: 'Hi' });
      expect(result.stop).toBeUndefined();
      expect(result.response_format).toBeUndefined();
    });

    it('sets response_format to undefined for text format', () => {
      const request: AdapterRequest = { prompt: 'Hi', model: 'local-model', responseFormat: 'text' };
      const result = toLMStudioRequest(request);
      expect(result.response_format).toBeUndefined();
    });
  });

  describe('fromLMStudioResponse', () => {
    it('maps a complete LMStudio response', () => {
      const result = fromLMStudioResponse({
        id: 'lm-1',
        model: 'local-model',
        choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }, 150);
      expect(result.content).toBe('Hello!');
      expect(result.model).toBe('local-model');
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(5);
      expect(result.finishReason).toBe('stop');
      expect(result.latencyMs).toBe(150);
    });

    it('maps finish_reason length correctly', () => {
      const result = fromLMStudioResponse({
        id: 'lm-2',
        model: 'local-model',
        choices: [{ message: { content: 'partial' }, finish_reason: 'length' }],
      }, 10);
      expect(result.finishReason).toBe('length');
    });

    it('maps unknown finish_reason to unknown', () => {
      const result = fromLMStudioResponse({
        id: 'lm-3',
        model: 'local-model',
        choices: [{ message: { content: 'ok' }, finish_reason: 'content_filter' }],
      }, 10);
      expect(result.finishReason).toBe('unknown');
    });

    it('defaults token counts to null when usage is missing', () => {
      const result = fromLMStudioResponse({
        id: 'lm-4',
        model: 'local-model',
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      }, 10);
      expect(result.inputTokens).toBeNull();
      expect(result.outputTokens).toBeNull();
    });

    it('handles empty choices array', () => {
      const result = fromLMStudioResponse({
        id: 'lm-5',
        model: 'local-model',
        choices: [],
      }, 10);
      expect(result.content).toBe('');
      expect(result.finishReason).toBe('unknown');
    });
  });
});
