import { describe, it, expect } from 'vitest';
import { toGeminiRequest, fromGeminiResponse } from './GeminiMapper.js';
import type { AdapterRequest } from '../base/AdapterTypes.js';

describe('GeminiMapper', () => {
  describe('toGeminiRequest', () => {
    it('maps a full AdapterRequest with system prompt', () => {
      const request: AdapterRequest = {
        prompt: 'Hello',
        model: 'gemini-pro',
        systemPrompt: 'You are helpful',
        temperature: 0.5,
        maxTokens: 512,
        topP: 0.9,
        stopSequences: ['END'],
        responseFormat: 'json',
      };
      const result = toGeminiRequest(request);
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]).toEqual({ role: 'user', parts: [{ text: 'Hello' }] });
      expect(result.generationConfig?.temperature).toBe(0.5);
      expect(result.generationConfig?.maxOutputTokens).toBe(512);
      expect(result.generationConfig?.topP).toBe(0.9);
      expect(result.generationConfig?.stopSequences).toEqual(['END']);
      expect(result.generationConfig?.responseMimeType).toBe('application/json');
      expect(result.systemInstruction).toEqual({ parts: [{ text: 'You are helpful' }] });
    });

    it('maps a minimal AdapterRequest without system prompt', () => {
      const request: AdapterRequest = { prompt: 'Hi', model: 'gemini-pro' };
      const result = toGeminiRequest(request);
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].parts[0].text).toBe('Hi');
      expect(result.systemInstruction).toBeUndefined();
      expect(result.generationConfig?.responseMimeType).toBeUndefined();
    });

    it('sets responseMimeType to undefined for text format', () => {
      const request: AdapterRequest = { prompt: 'Hi', model: 'gemini-pro', responseFormat: 'text' };
      const result = toGeminiRequest(request);
      expect(result.generationConfig?.responseMimeType).toBeUndefined();
    });
  });

  describe('fromGeminiResponse', () => {
    it('maps a complete Gemini response with STOP', () => {
      const result = fromGeminiResponse({
        candidates: [{ content: { parts: [{ text: 'Hello!' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      }, 150, 'gemini-pro');
      expect(result.content).toBe('Hello!');
      expect(result.model).toBe('gemini-pro');
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(5);
      expect(result.finishReason).toBe('stop');
      expect(result.latencyMs).toBe(150);
    });

    it('maps MAX_TOKENS finishReason to length', () => {
      const result = fromGeminiResponse({
        candidates: [{ content: { parts: [{ text: 'partial' }] }, finishReason: 'MAX_TOKENS' }],
      }, 10, 'gemini-pro');
      expect(result.finishReason).toBe('length');
    });

    it('maps unknown finishReason to unknown', () => {
      const result = fromGeminiResponse({
        candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'SAFETY' }],
      }, 10, 'gemini-pro');
      expect(result.finishReason).toBe('unknown');
    });

    it('concatenates multiple parts', () => {
      const result = fromGeminiResponse({
        candidates: [{
          content: { parts: [{ text: 'Hello ' }, { text: 'world' }] },
          finishReason: 'STOP',
        }],
      }, 10, 'gemini-pro');
      expect(result.content).toBe('Hello world');
    });

    it('defaults token counts to null when usageMetadata is missing', () => {
      const result = fromGeminiResponse({
        candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
      }, 10, 'gemini-pro');
      expect(result.inputTokens).toBeNull();
      expect(result.outputTokens).toBeNull();
    });

    it('handles empty candidates array', () => {
      const result = fromGeminiResponse({ candidates: [] } as any, 10, 'gemini-pro');
      expect(result.content).toBe('');
      expect(result.finishReason).toBe('unknown');
    });

    it('uses the requestModel parameter as model', () => {
      const result = fromGeminiResponse({
        candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
      }, 10, 'gemini-1.5-flash');
      expect(result.model).toBe('gemini-1.5-flash');
    });
  });
});
