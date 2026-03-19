import { describe, it, expect } from 'vitest';
import {
  ACDSRuntimeError,
  MethodUnresolvedError,
  MethodNotAvailableError,
  ProviderUnavailableError,
  PolicyBlockedError,
  InvalidRegistrationError,
  InvalidExecutionPlanError,
  ValidationFailedError,
} from '../../../src/domain/errors.js';

describe('Error Model', () => {
  it('ACDSRuntimeError carries reason code and details', () => {
    const err = new ACDSRuntimeError('POLICY_BLOCKED', 'Denied', { rule: 'local_only' });
    expect(err.code).toBe('POLICY_BLOCKED');
    expect(err.message).toBe('Denied');
    expect(err.details).toEqual({ rule: 'local_only' });
    expect(err).toBeInstanceOf(Error);
  });

  it('MethodUnresolvedError has correct code', () => {
    const err = new MethodUnresolvedError('unknown_intent');
    expect(err.code).toBe('METHOD_UNRESOLVED');
    expect(err.details).toEqual({ intent: 'unknown_intent' });
  });

  it('MethodNotAvailableError carries method and provider', () => {
    const err = new MethodNotAvailableError('apple.vision.lidar', 'apple-intelligence-runtime');
    expect(err.code).toBe('METHOD_NOT_AVAILABLE');
    expect(err.details?.methodId).toBe('apple.vision.lidar');
    expect(err.details?.providerId).toBe('apple-intelligence-runtime');
  });

  it('ProviderUnavailableError carries provider ID', () => {
    const err = new ProviderUnavailableError('apple-intelligence-runtime');
    expect(err.code).toBe('PROVIDER_UNAVAILABLE');
  });

  it('PolicyBlockedError carries custom reason', () => {
    const err = new PolicyBlockedError('Capability invocation requires explicit approval', {
      capabilityId: 'openai-api',
    });
    expect(err.code).toBe('POLICY_BLOCKED');
  });

  it('InvalidRegistrationError has correct code', () => {
    const err = new InvalidRegistrationError('Mixed-class registration');
    expect(err.code).toBe('INVALID_REGISTRATION');
  });

  it('InvalidExecutionPlanError has correct code', () => {
    const err = new InvalidExecutionPlanError('Cross-class fallback');
    expect(err.code).toBe('INVALID_EXECUTION_PLAN');
  });

  it('ValidationFailedError has correct code', () => {
    const err = new ValidationFailedError('Schema mismatch');
    expect(err.code).toBe('VALIDATION_FAILED');
  });

  it('all error types extend ACDSRuntimeError', () => {
    const errors = [
      new MethodUnresolvedError('x'),
      new MethodNotAvailableError('x', 'y'),
      new ProviderUnavailableError('x'),
      new PolicyBlockedError('x'),
      new InvalidRegistrationError('x'),
      new InvalidExecutionPlanError('x'),
      new ValidationFailedError('x'),
    ];

    for (const err of errors) {
      expect(err).toBeInstanceOf(ACDSRuntimeError);
      expect(err).toBeInstanceOf(Error);
      expect(typeof err.code).toBe('string');
    }
  });
});
