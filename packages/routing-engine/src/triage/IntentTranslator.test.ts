import { describe, it, expect } from 'vitest';
import { IntentTranslator } from './IntentTranslator.js';
import { TaskType, Modality, Sensitivity, QualityTier, ContextSize, CognitiveGrade } from '@acds/core-types';
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
      localOnly: false,
      externalAllowed: true,
      offlineRequired: false,
    },
    contextSizeEstimate: ContextSize.SMALL,
    requiresSchemaValidation: false,
    origin: 'process_swarm',
    timestamp: '2026-03-20T12:00:00Z',
    ...overrides,
  };
}

describe('IntentTranslator', () => {
  const translator = new IntentTranslator();

  it('maps quality tier to cognitive grade', () => {
    const low = translator.translate(makeEnvelope({ qualityTier: QualityTier.LOW }));
    expect(low.cognitiveGrade).toBe(CognitiveGrade.BASIC);

    const medium = translator.translate(makeEnvelope({ qualityTier: QualityTier.MEDIUM }));
    expect(medium.cognitiveGrade).toBe(CognitiveGrade.STANDARD);

    const high = translator.translate(makeEnvelope({ qualityTier: QualityTier.HIGH }));
    expect(high.cognitiveGrade).toBe(CognitiveGrade.ENHANCED);

    const critical = translator.translate(makeEnvelope({ qualityTier: QualityTier.CRITICAL }));
    expect(critical.cognitiveGrade).toBe(CognitiveGrade.FRONTIER);
  });

  it('maps sensitivity to privacy constraint', () => {
    const pub = translator.translate(makeEnvelope({
      sensitivity: Sensitivity.PUBLIC,
      executionConstraints: { localOnly: false, externalAllowed: true, offlineRequired: false },
    }));
    expect(pub.constraints.privacy).toBe('cloud_allowed');

    const restricted = translator.translate(makeEnvelope({
      sensitivity: Sensitivity.RESTRICTED,
      executionConstraints: { localOnly: false, externalAllowed: false, offlineRequired: false },
    }));
    expect(restricted.constraints.privacy).toBe('local_only');
  });

  it('executionConstraints.localOnly overrides sensitivity', () => {
    const result = translator.translate(makeEnvelope({
      sensitivity: Sensitivity.PUBLIC,
      executionConstraints: { localOnly: true, externalAllowed: false, offlineRequired: false },
    }));
    expect(result.constraints.privacy).toBe('local_only');
  });

  it('sets application to origin', () => {
    const result = translator.translate(makeEnvelope({ origin: 'api' }));
    expect(result.application).toBe('api');
  });

  it('preserves task type', () => {
    const result = translator.translate(makeEnvelope({ taskClass: TaskType.CODING }));
    expect(result.taskType).toBe(TaskType.CODING);
  });

  it('passes through cost sensitivity', () => {
    const result = translator.translate(makeEnvelope({ costSensitivity: 'high' }));
    expect(result.constraints.costSensitivity).toBe('high');
  });

  it('passes through latency target', () => {
    const result = translator.translate(makeEnvelope({ latencyTargetMs: 5000 }));
    expect(result.constraints.maxLatencyMs).toBe(5000);
  });

  it('falls back to STANDARD grade for unknown quality tier', () => {
    const result = translator.translate(makeEnvelope({ qualityTier: 'unknown' as any }));
    expect(result.cognitiveGrade).toBe(CognitiveGrade.STANDARD);
  });

  it('falls back to local_only for unknown sensitivity', () => {
    const result = translator.translate(makeEnvelope({
      sensitivity: 'unknown' as any,
      executionConstraints: { localOnly: false, externalAllowed: false, offlineRequired: false },
    }));
    expect(result.constraints.privacy).toBe('local_only');
  });

  it('maps null latency target through', () => {
    const result = translator.translate(makeEnvelope({ latencyTargetMs: null }));
    expect(result.constraints.maxLatencyMs).toBeNull();
  });

  it('sets structuredOutputRequired from requiresSchemaValidation', () => {
    const result = translator.translate(makeEnvelope({ requiresSchemaValidation: true }));
    expect(result.constraints.structuredOutputRequired).toBe(true);
  });
});
