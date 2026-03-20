import { describe, it, expect } from 'vitest';
import { toOllamaRequest, fromOllamaResponse } from './OllamaMapper.js';
import type { AdapterRequest } from '../base/AdapterTypes.js';

describe('OllamaMapper', () => {
  describe('toOllamaRequest', () => {
    it('maps a full AdapterRequest to Ollama format', () => {
      const request: AdapterRequest = {
        prompt: 'Hello',
        model: 'llama3',
        systemPrompt: 'You are helpful',
        temperature: 0.5,
        maxTokens: 512,
        topP: 0.9,
        stopSequences: ['END'],
        responseFormat: 'json',
      };
      const result = toOllamaRequest(request);
      expect(result.model).toBe('llama3');
      expect(result.prompt).toBe('Hello');
      expect(result.system).toBe('You are helpful');
      expect(result.options?.temperature).toBe(0.5);
      expect(result.options?.num_predict).toBe(512);
      expect(result.options?.top_p).toBe(0.9);
      expect(result.options?.stop).toEqual(['END']);
      expect(result.format).toBe('json');
      expect(result.stream).toBe(false);
    });

    it('maps a minimal AdapterRequest', () => {
      const request: AdapterRequest = { prompt: 'Hi', model: 'mistral' };
      const result = toOllamaRequest(request);
      expect(result.model).toBe('mistral');
      expect(result.prompt).toBe('Hi');
      expect(result.system).toBeUndefined();
      expect(result.options?.temperature).toBeUndefined();
      expect(result.options?.num_predict).toBeUndefined();
      expect(result.options?.top_p).toBeUndefined();
      expect(result.options?.stop).toBeUndefined();
      expect(result.format).toBeUndefined();
      expect(result.stream).toBe(false);
    });

    it('sets format to undefined when responseFormat is text', () => {
      const request: AdapterRequest = { prompt: 'Hi', model: 'llama3', responseFormat: 'text' };
      const result = toOllamaRequest(request);
      expect(result.format).toBeUndefined();
    });

    it('sets format to json when responseFormat is json', () => {
      const request: AdapterRequest = { prompt: 'Hi', model: 'llama3', responseFormat: 'json' };
      const result = toOllamaRequest(request);
      expect(result.format).toBe('json');
    });
  });

  describe('fromOllamaResponse', () => {
    it('maps a complete Ollama response', () => {
      const result = fromOllamaResponse({
        model: 'llama3',
        response: 'Hello!',
        done: true,
        prompt_eval_count: 10,
        eval_count: 5,
        total_duration: 1000000,
      }, 150);
      expect(result.content).toBe('Hello!');
      expect(result.model).toBe('llama3');
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(5);
      expect(result.finishReason).toBe('stop');
      expect(result.latencyMs).toBe(150);
    });

    it('sets finishReason to unknown when done is false', () => {
      const result = fromOllamaResponse({
        model: 'llama3',
        response: 'partial',
        done: false,
      }, 50);
      expect(result.finishReason).toBe('unknown');
    });

    it('defaults token counts to null when not provided', () => {
      const result = fromOllamaResponse({
        model: 'llama3',
        response: 'ok',
        done: true,
      }, 10);
      expect(result.inputTokens).toBeNull();
      expect(result.outputTokens).toBeNull();
    });

    it('preserves zero token counts', () => {
      const result = fromOllamaResponse({
        model: 'llama3',
        response: '',
        done: true,
        prompt_eval_count: 0,
        eval_count: 0,
      }, 10);
      expect(result.inputTokens).toBe(0);
      expect(result.outputTokens).toBe(0);
    });
  });
});
