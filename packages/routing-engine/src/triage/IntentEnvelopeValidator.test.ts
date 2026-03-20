import { describe, it, expect } from 'vitest';
import { IntentEnvelopeValidator } from './IntentEnvelopeValidator.js';
import { TaskType, Modality, Sensitivity, QualityTier, ContextSize } from '@acds/core-types';
import type { IntentEnvelope } from '@acds/core-types';

function makeEnvelope(overrides: Partial<IntentEnvelope> = {}): IntentEnvelope {
  return {
    intentId: 'test-intent-1',
    taskClass: TaskType.ANALYTICAL,
    modality: Modality.TEXT_TO_TEXT,
    sensitivity: Sensitivity.INTERNAL,
    qualityTier: QualityTier.MEDIUM,
    latencyTargetMs: 30000,
    costSensitivity: 'medium',
    executionConstraints: {
      localOnly: true,
      externalAllowed: false,
      offlineRequired: false,
    },
    contextSizeEstimate: ContextSize.SMALL,
    requiresSchemaValidation: false,
    origin: 'process_swarm',
    timestamp: '2026-03-20T12:00:00Z',
    ...overrides,
  };
}

describe('IntentEnvelopeValidator', () => {
  const validator = new IntentEnvelopeValidator();

  it('accepts a valid envelope', () => {
    const result = validator.validate(makeEnvelope());
    expect(result.valid).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = validator.validate(makeEnvelope({ intentId: '' }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.error).toBe('INVALID_INTENT_ENVELOPE');
      expect(result.error.details).toContain('intentId');
    }
  });

  it('rejects invalid taskClass', () => {
    const result = validator.validate(makeEnvelope({ taskClass: 'nonexistent' as any }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.reason).toContain('taskClass');
    }
  });

  it('rejects invalid modality', () => {
    const result = validator.validate(makeEnvelope({ modality: 'hologram' as any }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.reason).toContain('modality');
    }
  });

  it('rejects invalid sensitivity', () => {
    const result = validator.validate(makeEnvelope({ sensitivity: 'top_secret' as any }));
    expect(result.valid).toBe(false);
  });

  it('rejects mutually exclusive execution constraints', () => {
    const result = validator.validate(makeEnvelope({
      executionConstraints: { localOnly: true, externalAllowed: true, offlineRequired: false },
    }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.reason).toContain('mutually exclusive');
    }
  });

  it('rejects invalid origin', () => {
    const result = validator.validate(makeEnvelope({ origin: 'unknown' as any }));
    expect(result.valid).toBe(false);
  });

  it('rejects invalid costSensitivity', () => {
    const result = validator.validate(makeEnvelope({ costSensitivity: 'extreme' as any }));
    expect(result.valid).toBe(false);
  });

  it('rejects invalid qualityTier', () => {
    const result = validator.validate(makeEnvelope({ qualityTier: 'legendary' as any }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.reason).toContain('qualityTier');
    }
  });

  it('rejects invalid contextSizeEstimate', () => {
    const result = validator.validate(makeEnvelope({ contextSizeEstimate: 'enormous' as any }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.reason).toContain('contextSizeEstimate');
    }
  });

  it('rejects missing modality', () => {
    const result = validator.validate(makeEnvelope({ modality: '' as any }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.details).toContain('modality');
    }
  });

  it('rejects missing qualityTier', () => {
    const result = validator.validate(makeEnvelope({ qualityTier: '' as any }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.details).toContain('qualityTier');
    }
  });

  it('rejects missing origin', () => {
    const result = validator.validate(makeEnvelope({ origin: '' as any }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.details).toContain('origin');
    }
  });

  it('rejects missing executionConstraints', () => {
    const result = validator.validate(makeEnvelope({ executionConstraints: undefined as any }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.details).toContain('executionConstraints');
    }
  });

  it('rejects missing sensitivity', () => {
    const result = validator.validate(makeEnvelope({ sensitivity: '' as any }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.details).toContain('sensitivity');
    }
  });

  it('rejects multiple missing fields at once', () => {
    const result = validator.validate(makeEnvelope({
      intentId: '',
      taskClass: '' as any,
      timestamp: '',
      modality: '' as any,
      sensitivity: '' as any,
      qualityTier: '' as any,
      origin: '' as any,
      executionConstraints: undefined as any,
    }));
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.details!.length).toBe(8);
    }
  });

  it('accepts all valid origins', () => {
    for (const origin of ['process_swarm', 'manual', 'api'] as const) {
      const result = validator.validate(makeEnvelope({ origin }));
      expect(result.valid).toBe(true);
    }
  });

  it('accepts all valid modalities', () => {
    for (const modality of Object.values(Modality)) {
      const result = validator.validate(makeEnvelope({ modality }));
      expect(result.valid).toBe(true);
    }
  });

  it('accepts all valid quality tiers', () => {
    for (const qualityTier of Object.values(QualityTier)) {
      const result = validator.validate(makeEnvelope({ qualityTier }));
      expect(result.valid).toBe(true);
    }
  });

  it('accepts all valid context sizes', () => {
    for (const contextSizeEstimate of Object.values(ContextSize)) {
      const result = validator.validate(makeEnvelope({ contextSizeEstimate }));
      expect(result.valid).toBe(true);
    }
  });
});
