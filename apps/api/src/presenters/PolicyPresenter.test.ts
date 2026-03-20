import { describe, it, expect } from 'vitest';
import { PolicyPresenter } from './PolicyPresenter.js';
import type { GlobalPolicy, ApplicationPolicy, ProcessPolicy } from '@acds/policy-engine';

const now = new Date('2026-03-15T10:00:00Z');

function makeGlobalPolicy(overrides: Partial<GlobalPolicy> = {}): GlobalPolicy {
  return {
    id: 'gp-1',
    allowedVendors: ['openai', 'ollama'],
    blockedVendors: ['lmstudio'],
    defaultPrivacy: 'standard',
    defaultCostSensitivity: 'medium',
    localPreferredTaskTypes: ['generation'],
    structuredOutputRequiredForGrades: ['advanced'],
    traceabilityRequiredForGrades: ['expert'],
    maxLatencyMsByLoadTier: { low: 10000, medium: 5000, high: 2000 },
    cloudRequiredLoadTiers: ['high'],
    enabled: true,
    updatedAt: now,
    ...overrides,
  } as GlobalPolicy;
}

function makeApplicationPolicy(overrides: Partial<ApplicationPolicy> = {}): ApplicationPolicy {
  return {
    id: 'ap-1',
    application: 'my-app',
    allowedVendors: ['openai'],
    blockedVendors: ['lmstudio'],
    privacyOverride: 'strict',
    costSensitivityOverride: 'low',
    preferredModelProfileIds: ['mp-1'],
    localPreferredTaskTypes: [],
    blockedModelProfileIds: ['mp-bad'],
    structuredOutputRequiredForGrades: [],
    enabled: true,
    updatedAt: now,
    ...overrides,
  } as ApplicationPolicy;
}

function makeProcessPolicy(overrides: Partial<ProcessPolicy> = {}): ProcessPolicy {
  return {
    id: 'pp-1',
    application: 'my-app',
    process: 'my-proc',
    step: 'my-step',
    defaultModelProfileId: 'mp-1',
    defaultTacticProfileId: 'tp-1',
    privacyOverride: 'strict',
    costSensitivityOverride: 'low',
    allowedModelProfileIds: ['mp-1', 'mp-2'],
    blockedModelProfileIds: ['mp-bad'],
    allowedTacticProfileIds: ['tp-1'],
    forceEscalationForGrades: ['expert'],
    enabled: true,
    updatedAt: now,
    ...overrides,
  } as ProcessPolicy;
}

describe('PolicyPresenter', () => {
  describe('fromGlobal', () => {
    it('formats global policy with correct level', () => {
      const view = PolicyPresenter.fromGlobal(makeGlobalPolicy());

      expect(view.id).toBe('gp-1');
      expect(view.level).toBe('global');
      expect(view.allowedVendors).toEqual(['openai', 'ollama']);
      expect(view.blockedVendors).toEqual(['lmstudio']);
      expect(view.defaults.privacy).toBe('standard');
      expect(view.defaults.costSensitivity).toBe('medium');
      expect(view.defaults.localPreferredTaskTypes).toEqual(['generation']);
      expect(view.constraints.structuredOutputRequiredForGrades).toEqual(['advanced']);
      expect(view.constraints.traceabilityRequiredForGrades).toEqual(['expert']);
      expect(view.constraints.maxLatencyMsByLoadTier).toEqual({ low: 10000, medium: 5000, high: 2000 });
      expect(view.constraints.cloudRequiredLoadTiers).toEqual(['high']);
      expect(view.enabled).toBe(true);
      expect(view.createdAt).toBe('2026-03-15T10:00:00.000Z');
      expect(view.updatedAt).toBe('2026-03-15T10:00:00.000Z');
    });
  });

  describe('fromApplication', () => {
    it('formats application policy with correct level', () => {
      const view = PolicyPresenter.fromApplication(makeApplicationPolicy());

      expect(view.id).toBe('ap-1');
      expect(view.level).toBe('application');
      expect(view.application).toBe('my-app');
      expect(view.allowedVendors).toEqual(['openai']);
      expect(view.blockedVendors).toEqual(['lmstudio']);
      expect(view.defaults.privacyOverride).toBe('strict');
      expect(view.defaults.costSensitivityOverride).toBe('low');
      expect(view.defaults.preferredModelProfileIds).toEqual(['mp-1']);
      expect(view.constraints.blockedModelProfileIds).toEqual(['mp-bad']);
      expect(view.enabled).toBe(true);
    });

    it('defaults to empty arrays for null vendor lists', () => {
      const view = PolicyPresenter.fromApplication(makeApplicationPolicy({
        allowedVendors: undefined as any,
        blockedVendors: undefined as any,
      }));
      expect(view.allowedVendors).toEqual([]);
      expect(view.blockedVendors).toEqual([]);
    });
  });

  describe('fromProcess', () => {
    it('formats process policy with correct level', () => {
      const view = PolicyPresenter.fromProcess(makeProcessPolicy());

      expect(view.id).toBe('pp-1');
      expect(view.level).toBe('process');
      expect(view.application).toBe('my-app');
      expect(view.process).toBe('my-proc');
      expect(view.allowedVendors).toEqual([]);
      expect(view.blockedVendors).toEqual([]);
      expect(view.defaults.defaultModelProfileId).toBe('mp-1');
      expect(view.defaults.defaultTacticProfileId).toBe('tp-1');
      expect(view.defaults.privacyOverride).toBe('strict');
      expect(view.defaults.costSensitivityOverride).toBe('low');
      expect(view.constraints.step).toBe('my-step');
      expect(view.constraints.allowedModelProfileIds).toEqual(['mp-1', 'mp-2']);
      expect(view.constraints.blockedModelProfileIds).toEqual(['mp-bad']);
      expect(view.constraints.allowedTacticProfileIds).toEqual(['tp-1']);
      expect(view.constraints.forceEscalationForGrades).toEqual(['expert']);
      expect(view.enabled).toBe(true);
    });
  });
});
