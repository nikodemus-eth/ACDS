/**
 * ARGUS-9 Tier 4 — Policy Merge Edge Cases
 *
 * Tests advanced policy merge behavior: all-vendors-blocked, missing overrides,
 * forceEscalation source restrictions, and ambiguous semantics.
 */

import { describe, it, expect } from 'vitest';
import { PolicyMergeResolver } from '@acds/policy-engine';
import { CognitiveGrade, LoadTier } from '@acds/core-types';
import {
  makeGlobalPolicy,
  makeApplicationPolicy,
  makeProcessPolicy,
  makeInstanceOverrides,
} from './_fixtures.js';

const resolver = new PolicyMergeResolver();

describe('ARGUS B5-B7: Policy Merge Edge Cases', () => {

  it('produces empty allowedVendors when all vendors are blocked', () => {
    // VULN: ambiguous semantics — does empty allowedVendors mean "all" or "none"?
    const global = makeGlobalPolicy({
      allowedVendors: ['openai' as any, 'gemini' as any],
      blockedVendors: ['openai' as any, 'gemini' as any],
    });
    const result = resolver.merge(
      global, null, null, makeInstanceOverrides(),
      CognitiveGrade.STANDARD, LoadTier.SINGLE_SHOT,
    );
    // All vendors blocked → allowedVendors is empty
    expect(result.allowedVendors).toHaveLength(0);
  });

  it('application cannot set forceEscalation — only process and instance can', () => {
    // VULN: application-level escalation has no pathway
    const global = makeGlobalPolicy();
    const app = makeApplicationPolicy();
    // ApplicationPolicy has no forceEscalationForGrades field
    const process = makeProcessPolicy({ forceEscalationForGrades: null });
    const instance = makeInstanceOverrides({ forceEscalation: false });

    const result = resolver.merge(
      global, app, process, instance,
      CognitiveGrade.FRONTIER, LoadTier.SINGLE_SHOT,
    );
    expect(result.forceEscalation).toBe(false);
  });

  it('process forceEscalationForGrades fires when matching grade', () => {
    const global = makeGlobalPolicy();
    const process = makeProcessPolicy({
      forceEscalationForGrades: [CognitiveGrade.FRONTIER],
    });

    const result = resolver.merge(
      global, null, process, makeInstanceOverrides(),
      CognitiveGrade.FRONTIER, LoadTier.SINGLE_SHOT,
    );
    expect(result.forceEscalation).toBe(true);
  });

  it('maxLatencyMs only from global — no application or process override', () => {
    // VULN: application and process cannot override maxLatencyMs
    const global = makeGlobalPolicy({
      maxLatencyMsByLoadTier: { [LoadTier.SINGLE_SHOT]: 1000 } as any,
    });

    const result = resolver.merge(
      global, null, null, makeInstanceOverrides(),
      CognitiveGrade.STANDARD, LoadTier.SINGLE_SHOT,
    );
    expect(result.maxLatencyMs).toBe(1000);

    // No way for app or process to change it
    const result2 = resolver.merge(
      global,
      makeApplicationPolicy(),
      makeProcessPolicy(),
      makeInstanceOverrides(),
      CognitiveGrade.STANDARD, LoadTier.SINGLE_SHOT,
    );
    expect(result2.maxLatencyMs).toBe(1000);
  });

  it('allowedTacticProfileIds only from process — application has no say', () => {
    // VULN: application-level tactic restriction has no pathway
    const global = makeGlobalPolicy();
    const app = makeApplicationPolicy();
    // ApplicationPolicy has no allowedTacticProfileIds field
    const process = makeProcessPolicy({
      allowedTacticProfileIds: ['tactic-a'],
    });

    const result = resolver.merge(
      global, app, process, makeInstanceOverrides(),
      CognitiveGrade.STANDARD, LoadTier.SINGLE_SHOT,
    );
    expect(result.allowedTacticProfileIds).toEqual(['tactic-a']);
  });

  it('null application + null process → purely global policy', () => {
    // VULN: no indicator in EffectivePolicy that this is a minimally-resolved policy
    const global = makeGlobalPolicy({
      defaultPrivacy: 'local_only',
      defaultCostSensitivity: 'high',
    });

    const result = resolver.merge(
      global, null, null, makeInstanceOverrides(),
      CognitiveGrade.STANDARD, LoadTier.SINGLE_SHOT,
    );
    expect(result.privacy).toBe('local_only');
    expect(result.costSensitivity).toBe('high');
    expect(result.defaultModelProfileId).toBeNull();
    expect(result.defaultTacticProfileId).toBeNull();
    expect(result.allowedModelProfileIds).toBeNull();
    expect(result.allowedTacticProfileIds).toBeNull();
  });

  it('does not deduplicate blockedVendors', () => {
    // VULN: same vendor in both global and app blockedVendors → duplicate in merged
    const global = makeGlobalPolicy({ blockedVendors: ['openai' as any] });
    const app = makeApplicationPolicy({ blockedVendors: ['openai' as any] });

    const result = resolver.merge(
      global, app, null, makeInstanceOverrides(),
      CognitiveGrade.STANDARD, LoadTier.SINGLE_SHOT,
    );
    // Duplicated
    expect(result.blockedVendors.filter(v => v === 'openai')).toHaveLength(2);
  });

  it('does not deduplicate blockedModelProfileIds', () => {
    // VULN: same profile in both app and process blockedModelProfileIds → duplicate
    const app = makeApplicationPolicy({ blockedModelProfileIds: ['p-1'] });
    const process = makeProcessPolicy({ blockedModelProfileIds: ['p-1'] });

    const result = resolver.merge(
      makeGlobalPolicy(), app, process, makeInstanceOverrides(),
      CognitiveGrade.STANDARD, LoadTier.SINGLE_SHOT,
    );
    expect(result.blockedModelProfileIds.filter(p => p === 'p-1')).toHaveLength(2);
  });

  it('instanceOverrides.forceLocalOnly overrides all privacy with no audit trail', () => {
    // VULN: instance override silently overrides global/app/process privacy with no logging
    const global = makeGlobalPolicy({ defaultPrivacy: 'cloud_preferred' });
    const app = makeApplicationPolicy({ privacyOverride: 'cloud_allowed' });

    const result = resolver.merge(
      global, app, null, makeInstanceOverrides({ forceLocalOnly: true }),
      CognitiveGrade.STANDARD, LoadTier.SINGLE_SHOT,
    );
    expect(result.privacy).toBe('local_only');
  });

  it('instanceOverrides.boostCostSensitivity overrides all cost sensitivity', () => {
    // VULN: instance override silently overrides cost sensitivity
    const global = makeGlobalPolicy({ defaultCostSensitivity: 'low' });

    const result = resolver.merge(
      global, null, null, makeInstanceOverrides({ boostCostSensitivity: true }),
      CognitiveGrade.STANDARD, LoadTier.SINGLE_SHOT,
    );
    expect(result.costSensitivity).toBe('high');
  });
});
