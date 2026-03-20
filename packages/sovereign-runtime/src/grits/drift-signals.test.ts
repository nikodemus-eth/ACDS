import { describe, it, expect } from 'vitest';
import { emitDriftSignal, checkResolverDrift, checkCapabilityCreep } from './drift-signals.js';
import type { DriftSignal } from './drift-signals.js';

describe('Drift Signals', () => {
  describe('emitDriftSignal', () => {
    it('returns a ValidationResult with drift status', () => {
      const signal: DriftSignal = {
        type: 'resolver_drift',
        methodId: 'apple.vision.ocr',
        description: 'Method changed',
        severity: 'high',
        timestamp: new Date().toISOString(),
        details: { expected: 'a', actual: 'b' },
      };
      const result = emitDriftSignal(signal);
      expect(result.status).toBe('drift');
      expect(result.severity).toBe('high');
      expect(result.message).toContain('resolver_drift');
      expect(result.details?.driftType).toBe('resolver_drift');
      expect(result.details?.methodId).toBe('apple.vision.ocr');
    });

    it('includes additional details from signal', () => {
      const signal: DriftSignal = {
        type: 'latency_drift',
        methodId: 'test',
        description: 'Slow',
        severity: 'medium',
        timestamp: new Date().toISOString(),
        details: { p95: 500 },
      };
      const result = emitDriftSignal(signal);
      expect(result.details?.p95).toBe(500);
    });
  });

  describe('checkResolverDrift', () => {
    it('returns undefined when methods match', () => {
      const result = checkResolverDrift('apple.vision.ocr', 'apple.vision.ocr', 'OCR task');
      expect(result).toBeUndefined();
    });

    it('returns a DriftSignal when methods differ', () => {
      const result = checkResolverDrift('apple.vision.ocr', 'ollama.vision.ocr', 'OCR task');
      expect(result).toBeDefined();
      expect(result!.type).toBe('resolver_drift');
      expect(result!.severity).toBe('high');
      expect(result!.details?.expected).toBe('apple.vision.ocr');
      expect(result!.details?.actual).toBe('ollama.vision.ocr');
      expect(result!.description).toContain('OCR task');
    });
  });

  describe('checkCapabilityCreep', () => {
    it('returns undefined when execution class matches expected', () => {
      const result = checkCapabilityCreep('provider', 'provider', 'test');
      expect(result).toBeUndefined();
    });

    it('returns signal when provider expected but capability used', () => {
      const result = checkCapabilityCreep('capability', 'provider', 'test.method');
      expect(result).toBeDefined();
      expect(result!.type).toBe('capability_creep');
      expect(result!.severity).toBe('high');
      expect(result!.details?.expectedClass).toBe('provider');
      expect(result!.details?.actualClass).toBe('capability');
    });

    it('returns undefined when expected is not provider', () => {
      const result = checkCapabilityCreep('capability', 'capability', 'test');
      expect(result).toBeUndefined();
    });
  });
});
