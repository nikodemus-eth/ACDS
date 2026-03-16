import { describe, it, expect } from 'vitest';
import { toAppleBridgeRequest, fromAppleBridgeResponse } from './AppleIntelligenceMapper.js';
import type { AdapterRequest } from '../base/AdapterTypes.js';

describe('AppleIntelligenceMapper', () => {
  describe('toAppleBridgeRequest', () => {
    it('maps a full AdapterRequest to bridge format', () => {
      const request: AdapterRequest = {
        prompt: 'Classify this text',
        model: 'apple-fm-fast',
        systemPrompt: 'You are a classifier',
        temperature: 0.3,
        maxTokens: 100,
        responseFormat: 'json',
      };
      const result = toAppleBridgeRequest(request);
      expect(result.prompt).toBe('Classify this text');
      expect(result.model).toBe('apple-fm-fast');
      expect(result.system).toBe('You are a classifier');
      expect(result.temperature).toBe(0.3);
      expect(result.maxTokens).toBe(100);
      expect(result.responseFormat).toBe('json');
    });

    it('maps a minimal AdapterRequest', () => {
      const request: AdapterRequest = { prompt: 'Hello', model: 'apple-fm-base' };
      const result = toAppleBridgeRequest(request);
      expect(result.prompt).toBe('Hello');
      expect(result.model).toBe('apple-fm-base');
      expect(result.system).toBeUndefined();
      expect(result.temperature).toBeUndefined();
      expect(result.maxTokens).toBeUndefined();
    });
  });

  describe('fromAppleBridgeResponse', () => {
    it('maps a full bridge response to AdapterResponse', () => {
      const response = {
        model: 'apple-fm-fast',
        content: 'Classification: positive',
        done: true,
        inputTokens: 10,
        outputTokens: 5,
        durationMs: 50,
        capabilities: ['text-generation', 'classification'],
      };
      const result = fromAppleBridgeResponse(response, 55);
      expect(result.content).toBe('Classification: positive');
      expect(result.model).toBe('apple-fm-fast');
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(5);
      expect(result.finishReason).toBe('stop');
      expect(result.latencyMs).toBe(55);
      expect(result.rawMetadata).toEqual({ capabilities: ['text-generation', 'classification'] });
    });

    it('handles missing optional fields', () => {
      const response = {
        model: 'apple-fm-base',
        content: 'Result',
        done: false,
      };
      const result = fromAppleBridgeResponse(response, 30);
      expect(result.inputTokens).toBeNull();
      expect(result.outputTokens).toBeNull();
      expect(result.finishReason).toBe('unknown');
      expect(result.rawMetadata).toBeUndefined();
    });

    it('sets finishReason to stop when done is true', () => {
      const response = { model: 'm', content: 'c', done: true };
      expect(fromAppleBridgeResponse(response, 1).finishReason).toBe('stop');
    });

    it('sets finishReason to unknown when done is false', () => {
      const response = { model: 'm', content: 'c', done: false };
      expect(fromAppleBridgeResponse(response, 1).finishReason).toBe('unknown');
    });
  });
});
