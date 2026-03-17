import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyValidator } from './PolicyValidator.js';
import type { GlobalPolicy } from '../global/GlobalPolicy.js';
import type { ApplicationPolicy } from '../application/ApplicationPolicy.js';
import type { ProcessPolicy } from '../process/ProcessPolicy.js';

function makeGlobalPolicy(overrides: Partial<GlobalPolicy> = {}): GlobalPolicy {
  return {
    id: 'g1',
    allowedVendors: ['openai' as any],
    blockedVendors: [],
    defaultPrivacy: 'cloud_allowed',
    defaultCostSensitivity: 'medium',
    structuredOutputRequiredForGrades: [],
    traceabilityRequiredForGrades: [],
    maxLatencyMsByLoadTier: {},
    localPreferredTaskTypes: [],
    cloudRequiredLoadTiers: [],
    enabled: true,
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeAppPolicy(overrides: Partial<ApplicationPolicy> = {}): ApplicationPolicy {
  return {
    id: 'a1',
    application: 'test-app',
    allowedVendors: null,
    blockedVendors: null,
    privacyOverride: null,
    costSensitivityOverride: null,
    preferredModelProfileIds: null,
    blockedModelProfileIds: null,
    localPreferredTaskTypes: null,
    structuredOutputRequiredForGrades: null,
    enabled: true,
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeProcessPolicy(overrides: Partial<ProcessPolicy> = {}): ProcessPolicy {
  return {
    id: 'p1',
    application: 'test-app',
    process: 'test-process',
    step: null,
    defaultModelProfileId: null,
    defaultTacticProfileId: null,
    allowedModelProfileIds: null,
    blockedModelProfileIds: null,
    allowedTacticProfileIds: null,
    privacyOverride: null,
    costSensitivityOverride: null,
    forceEscalationForGrades: null,
    enabled: true,
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('PolicyValidator', () => {
  let validator: PolicyValidator;

  beforeEach(() => {
    validator = new PolicyValidator();
  });

  describe('validateGlobal', () => {
    it('returns no errors for a valid global policy', () => {
      const errors = validator.validateGlobal(makeGlobalPolicy());
      expect(errors).toEqual([]);
    });

    it('returns error when allowedVendors is empty', () => {
      const errors = validator.validateGlobal(makeGlobalPolicy({ allowedVendors: [] }));
      expect(errors).toContain('Global policy must have at least one allowed vendor');
    });

    it('returns error when allowedVendors is undefined/null', () => {
      const errors = validator.validateGlobal(makeGlobalPolicy({ allowedVendors: undefined as any }));
      expect(errors).toContain('Global policy must have at least one allowed vendor');
    });

    it('returns error when defaultPrivacy is missing', () => {
      const errors = validator.validateGlobal(makeGlobalPolicy({ defaultPrivacy: '' as any }));
      expect(errors).toContain('Default privacy is required');
    });

    it('returns error when defaultCostSensitivity is missing', () => {
      const errors = validator.validateGlobal(makeGlobalPolicy({ defaultCostSensitivity: '' as any }));
      expect(errors).toContain('Default cost sensitivity is required');
    });

    it('returns multiple errors when multiple fields are invalid', () => {
      const errors = validator.validateGlobal(makeGlobalPolicy({
        allowedVendors: [],
        defaultPrivacy: '' as any,
        defaultCostSensitivity: '' as any,
      }));
      expect(errors).toHaveLength(3);
    });
  });

  describe('validateApplication', () => {
    it('returns no errors for a valid application policy', () => {
      const errors = validator.validateApplication(makeAppPolicy());
      expect(errors).toEqual([]);
    });

    it('returns error when application is empty', () => {
      const errors = validator.validateApplication(makeAppPolicy({ application: '' }));
      expect(errors).toContain('Application name is required');
    });

    it('returns error when application is falsy', () => {
      const errors = validator.validateApplication(makeAppPolicy({ application: undefined as any }));
      expect(errors).toContain('Application name is required');
    });
  });

  describe('validateProcess', () => {
    it('returns no errors for a valid process policy', () => {
      const errors = validator.validateProcess(makeProcessPolicy());
      expect(errors).toEqual([]);
    });

    it('returns error when application is empty', () => {
      const errors = validator.validateProcess(makeProcessPolicy({ application: '' }));
      expect(errors).toContain('Application name is required');
    });

    it('returns error when process is empty', () => {
      const errors = validator.validateProcess(makeProcessPolicy({ process: '' }));
      expect(errors).toContain('Process name is required');
    });

    it('returns multiple errors when both application and process are empty', () => {
      const errors = validator.validateProcess(makeProcessPolicy({ application: '', process: '' }));
      expect(errors).toHaveLength(2);
      expect(errors).toContain('Application name is required');
      expect(errors).toContain('Process name is required');
    });
  });
});
