import { describe, it, expect } from 'vitest';
import { RoutingRequestNormalizer } from './RoutingRequestNormalizer.js';
import { TaskType, LoadTier, DecisionPosture, CognitiveGrade } from '@acds/core-types';

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    application: '  TestApp  ',
    process: '  Review  ',
    step: '  Analyze  ',
    taskType: TaskType.ANALYTICAL,
    loadTier: LoadTier.SINGLE_SHOT,
    decisionPosture: DecisionPosture.OPERATIONAL,
    cognitiveGrade: CognitiveGrade.STANDARD,
    input: 'test input',
    constraints: {
      privacy: 'cloud_allowed' as const,
      maxLatencyMs: null as number | null,
      costSensitivity: 'medium' as const,
      structuredOutputRequired: false,
      traceabilityRequired: false,
    },
    ...overrides,
  };
}

describe('RoutingRequestNormalizer', () => {
  const normalizer = new RoutingRequestNormalizer();

  it('trims and lowercases application, process, and step', () => {
    const result = normalizer.normalize(makeRequest() as any);
    expect(result.application).toBe('testapp');
    expect(result.process).toBe('review');
    expect(result.step).toBe('analyze');
  });

  it('preserves maxLatencyMs when provided', () => {
    const result = normalizer.normalize(
      makeRequest({
        constraints: {
          privacy: 'cloud_allowed',
          maxLatencyMs: 5000,
          costSensitivity: 'medium',
          structuredOutputRequired: false,
          traceabilityRequired: false,
        },
      }) as any,
    );
    expect(result.constraints.maxLatencyMs).toBe(5000);
  });

  it('sets maxLatencyMs to null when undefined', () => {
    const request = makeRequest();
    (request.constraints as any).maxLatencyMs = undefined;
    const result = normalizer.normalize(request as any);
    expect(result.constraints.maxLatencyMs).toBeNull();
  });

  it('normalizes instanceContext with defaults when present', () => {
    const result = normalizer.normalize(
      makeRequest({
        instanceContext: {
          retryCount: undefined,
          previousFailures: undefined,
          deadlinePressure: undefined,
          humanReviewStatus: undefined,
          additionalMetadata: undefined,
        },
      }) as any,
    );

    expect(result.instanceContext).toBeDefined();
    expect(result.instanceContext!.retryCount).toBe(0);
    expect(result.instanceContext!.previousFailures).toEqual([]);
    expect(result.instanceContext!.deadlinePressure).toBe(false);
    expect(result.instanceContext!.humanReviewStatus).toBe('none');
    expect(result.instanceContext!.additionalMetadata).toEqual({});
  });

  it('preserves provided instanceContext values', () => {
    const result = normalizer.normalize(
      makeRequest({
        instanceContext: {
          retryCount: 3,
          previousFailures: ['err1'],
          deadlinePressure: true,
          humanReviewStatus: 'pending',
          additionalMetadata: { key: 'value' },
        },
      }) as any,
    );

    expect(result.instanceContext!.retryCount).toBe(3);
    expect(result.instanceContext!.previousFailures).toEqual(['err1']);
    expect(result.instanceContext!.deadlinePressure).toBe(true);
    expect(result.instanceContext!.humanReviewStatus).toBe('pending');
    expect(result.instanceContext!.additionalMetadata).toEqual({ key: 'value' });
  });

  it('leaves instanceContext undefined when not provided', () => {
    const result = normalizer.normalize(makeRequest() as any);
    expect(result.instanceContext).toBeUndefined();
  });
});
