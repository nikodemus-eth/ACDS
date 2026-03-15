/**
 * ARGUS-9 Tier 1 — Policy Bypass & Conflict Gaps
 *
 * Tests that PolicyMergeResolver, PolicyConflictDetector, and eligibility
 * resolvers accept inputs that bypass policy intent.
 */

import { describe, it, expect } from 'vitest';
import {
  PolicyMergeResolver,
  PolicyConflictDetector,
  ProfileEligibilityResolver,
  TacticEligibilityResolver,
} from '@acds/policy-engine';
import {
  TaskType,
  LoadTier,
  CognitiveGrade,
  ProviderVendor,
} from '@acds/core-types';
import {
  makeGlobalPolicy,
  makeApplicationPolicy,
  makeProcessPolicy,
  makeInstanceOverrides,
  makeProfile,
  makeTactic,
  makeRequest,
  makeEffectivePolicy,
} from './_fixtures.js';

describe('ARGUS B1-B4: Policy Bypass', () => {
  const merger = new PolicyMergeResolver();

  describe('PolicyMergeResolver', () => {

    it('accepts process defaultModelProfileId referencing nonexistent profile', () => {
      // VULN: no cross-validation — process can reference a profile that doesn't exist
      const result = merger.merge(
        makeGlobalPolicy(),
        makeApplicationPolicy(),
        makeProcessPolicy({ defaultModelProfileId: 'nonexistent-profile-xyz' }),
        makeInstanceOverrides(),
        CognitiveGrade.STANDARD,
        LoadTier.SINGLE_SHOT,
      );
      expect(result.defaultModelProfileId).toBe('nonexistent-profile-xyz');
    });

    it('ignores localPreferredTaskTypes from GlobalPolicy', () => {
      // VULN: field is collected but never used in EffectivePolicy output
      const global = makeGlobalPolicy({
        localPreferredTaskTypes: [TaskType.ANALYTICAL, TaskType.CODING],
      });
      const result = merger.merge(
        global,
        null,
        null,
        makeInstanceOverrides(),
        CognitiveGrade.STANDARD,
        LoadTier.SINGLE_SHOT,
      );
      // EffectivePolicy has no localPreferredTaskTypes field
      expect(result).not.toHaveProperty('localPreferredTaskTypes');
    });

    it('permits application to not override escalation — only process and instance can', () => {
      // VULN: application policy has no forceEscalation field
      const result = merger.merge(
        makeGlobalPolicy(),
        makeApplicationPolicy(),
        makeProcessPolicy({ forceEscalationForGrades: null }),
        makeInstanceOverrides({ forceEscalation: false }),
        CognitiveGrade.FRONTIER,
        LoadTier.SINGLE_SHOT,
      );
      expect(result.forceEscalation).toBe(false);
    });

    it('produces maxLatencyMs only from global — no application/process override', () => {
      // VULN: maxLatencyMs comes solely from global.maxLatencyMsByLoadTier
      // application/process cannot tighten or relax the constraint
      const result = merger.merge(
        makeGlobalPolicy({ maxLatencyMsByLoadTier: { [LoadTier.SINGLE_SHOT]: 10000 } }),
        makeApplicationPolicy(),
        makeProcessPolicy(),
        makeInstanceOverrides(),
        CognitiveGrade.STANDARD,
        LoadTier.SINGLE_SHOT,
      );
      expect(result.maxLatencyMs).toBe(10000);
    });

    it('produces allowedTacticProfileIds only from process — application has no say', () => {
      // VULN: application cannot restrict tactic profiles
      const result = merger.merge(
        makeGlobalPolicy(),
        makeApplicationPolicy(),
        makeProcessPolicy({ allowedTacticProfileIds: ['tactic-x'] }),
        makeInstanceOverrides(),
        CognitiveGrade.STANDARD,
        LoadTier.SINGLE_SHOT,
      );
      expect(result.allowedTacticProfileIds).toEqual(['tactic-x']);
    });

    it('produces minimal policy with null application and null process', () => {
      // VULN: no indicator that effective policy is "purely global" vs "fully resolved"
      const result = merger.merge(
        makeGlobalPolicy(),
        null,
        null,
        makeInstanceOverrides(),
        CognitiveGrade.STANDARD,
        LoadTier.SINGLE_SHOT,
      );
      expect(result.defaultModelProfileId).toBeNull();
      expect(result.defaultTacticProfileId).toBeNull();
      expect(result.allowedModelProfileIds).toBeNull();
      expect(result.allowedTacticProfileIds).toBeNull();
    });

    it('permits instance forceLocalOnly to override all privacy settings silently', () => {
      // VULN: forceLocalOnly overrides cloud_preferred with no logging
      const result = merger.merge(
        makeGlobalPolicy({ defaultPrivacy: 'cloud_preferred' }),
        makeApplicationPolicy({ privacyOverride: 'cloud_preferred' }),
        makeProcessPolicy({ privacyOverride: 'cloud_preferred' }),
        makeInstanceOverrides({ forceLocalOnly: true }),
        CognitiveGrade.STANDARD,
        LoadTier.SINGLE_SHOT,
      );
      expect(result.privacy).toBe('local_only');
    });

    it('permits no deduplication of blockedVendors', () => {
      // VULN: same vendor can appear multiple times in blockedVendors
      const result = merger.merge(
        makeGlobalPolicy({ blockedVendors: [ProviderVendor.OPENAI] }),
        makeApplicationPolicy({ blockedVendors: [ProviderVendor.OPENAI] }),
        null,
        makeInstanceOverrides(),
        CognitiveGrade.STANDARD,
        LoadTier.SINGLE_SHOT,
      );
      const openaiCount = result.blockedVendors.filter(v => v === ProviderVendor.OPENAI).length;
      expect(openaiCount).toBe(2);
    });
  });

  describe('PolicyConflictDetector', () => {
    const detector = new PolicyConflictDetector();

    it('ignores vendor in both allowed and blocked within same application', () => {
      // VULN: only checks app.allowed vs global.blocked — not app.allowed vs app.blocked
      const conflicts = detector.detect(
        makeGlobalPolicy(),
        makeApplicationPolicy({
          allowedVendors: [ProviderVendor.OPENAI],
          blockedVendors: [ProviderVendor.OPENAI],
        }),
      );
      const vendorConflicts = conflicts.filter(c => c.field === 'allowedVendors');
      expect(vendorConflicts).toHaveLength(0);
    });

    it('ignores cost sensitivity contradictions', () => {
      // VULN: only 2 conflict types detected (vendor overlap, privacy mismatch)
      const conflicts = detector.detect(
        makeGlobalPolicy({ defaultCostSensitivity: 'high' }),
        makeApplicationPolicy({ costSensitivityOverride: 'low' }),
      );
      expect(conflicts).toHaveLength(0);
    });
  });

  describe('ProfileEligibilityResolver', () => {
    const resolver = new ProfileEligibilityResolver();

    it('permits empty allowedVendors to pass all profiles through', () => {
      // VULN: empty allowedVendors means "all allowed" — ambiguous semantics
      const policy = makeEffectivePolicy({ allowedVendors: [] });
      const profiles = [makeProfile({ vendor: ProviderVendor.OPENAI })];
      const eligible = resolver.resolve(profiles, policy, makeRequest());
      // No vendor filter when allowedVendors is empty
      expect(eligible.length).toBe(1);
    });
  });

  describe('TacticEligibilityResolver', () => {
    const resolver = new TacticEligibilityResolver();

    it('permits structuredOutputRequired=true policy to filter tactics incorrectly', () => {
      // VULN: policy says structured output required, but tactic with
      // requiresStructuredOutput=false is filtered OUT (correct behavior)
      // However, the reverse is not enforced: a tactic claiming structured output
      // is never verified to actually produce it
      const policy = makeEffectivePolicy({ structuredOutputRequired: true });
      const tactics = [
        makeTactic({ id: 't1', requiresStructuredOutput: true }),
        makeTactic({ id: 't2', requiresStructuredOutput: false }),
      ];
      const eligible = resolver.resolve(tactics, policy, makeRequest());
      expect(eligible.map(t => t.id)).toEqual(['t1']);
    });
  });
});
