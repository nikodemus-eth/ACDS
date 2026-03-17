import { describe, it, expect } from 'vitest';
import { RoutingRequestValidator } from './RoutingRequestValidator.js';
import { TaskType, LoadTier, DecisionPosture, CognitiveGrade } from '@acds/core-types';

function makeValidRequest() {
  return {
    application: 'TestApp',
    process: 'Review',
    step: 'Analyze',
    taskType: TaskType.ANALYTICAL,
    loadTier: LoadTier.SINGLE_SHOT,
    decisionPosture: DecisionPosture.OPERATIONAL,
    cognitiveGrade: CognitiveGrade.STANDARD,
    input: 'test input',
    constraints: {
      privacy: 'cloud_allowed',
      maxLatencyMs: null,
      costSensitivity: 'medium',
      structuredOutputRequired: false,
      traceabilityRequired: false,
    },
  };
}

describe('RoutingRequestValidator', () => {
  const validator = new RoutingRequestValidator();

  it('validates a valid request', () => {
    const result = validator.validate(makeValidRequest());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validateTyped validates a typed request', () => {
    const result = validator.validateTyped(makeValidRequest() as any);
    expect(result.valid).toBe(true);
  });

  it('returns errors for empty application', () => {
    const request = { ...makeValidRequest(), application: '' };
    const result = validator.validate(request);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns errors for missing constraints', () => {
    const request = { ...makeValidRequest() } as any;
    delete request.constraints;
    const result = validator.validate(request);
    expect(result.valid).toBe(false);
  });

  it('returns errors for invalid taskType', () => {
    const request = { ...makeValidRequest(), taskType: 'invalid_task' };
    const result = validator.validate(request);
    expect(result.valid).toBe(false);
  });

  it('returns errors for invalid privacy value', () => {
    const request = {
      ...makeValidRequest(),
      constraints: { ...makeValidRequest().constraints, privacy: 'invalid' },
    };
    const result = validator.validate(request);
    expect(result.valid).toBe(false);
  });

  it('returns errors for completely empty object', () => {
    const result = validator.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('accepts request with optional instanceContext', () => {
    const request = {
      ...makeValidRequest(),
      instanceContext: {
        retryCount: 0,
        previousFailures: [],
        deadlinePressure: false,
        humanReviewStatus: 'none',
        additionalMetadata: {},
      },
    };
    const result = validator.validate(request);
    expect(result.valid).toBe(true);
  });

  it('returns errors for invalid instanceContext fields', () => {
    const request = {
      ...makeValidRequest(),
      instanceContext: {
        retryCount: -1,
        previousFailures: [],
        deadlinePressure: false,
        humanReviewStatus: 'none',
        additionalMetadata: {},
      },
    };
    const result = validator.validate(request);
    expect(result.valid).toBe(false);
  });

  it('error messages include field paths', () => {
    const result = validator.validate({ application: '' });
    for (const error of result.errors) {
      expect(error).toContain(':');
    }
  });
});
