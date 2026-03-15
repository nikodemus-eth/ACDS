/**
 * ARGUS-9 Tier 3 — Auto-Apply Bypass
 *
 * Tests that LowRiskAutoApplyService and isAutoApplyPermitted
 * can be bypassed through trusted provider manipulation and config abuse.
 */

import { describe, it, expect } from 'vitest';
import {
  LowRiskAutoApplyService,
  isAutoApplyPermitted,
} from '@acds/adaptive-optimizer';
import { DecisionPosture } from '@acds/core-types';
import {
  makeFamilyState,
  makeRecommendation,
  makeRankedCandidate,
  MockFamilyRiskProvider,
  MockFamilyPostureProvider,
  MockRecentFailureCounter,
  CollectingAutoApplyDecisionWriter,
} from './_fixtures.js';

function createService(config?: { rollingScoreThreshold?: number; maxRecentFailures?: number }) {
  const risk = new MockFamilyRiskProvider('low');
  const posture = new MockFamilyPostureProvider(DecisionPosture.ADVISORY);
  const failures = new MockRecentFailureCounter(0);
  const writer = new CollectingAutoApplyDecisionWriter();
  const service = new LowRiskAutoApplyService(risk, posture, failures, writer, config);
  return { risk, posture, failures, writer, service };
}

describe('ARGUS F7, G7: Auto-Apply Bypass', () => {

  describe('isAutoApplyPermitted — risk classification', () => {

    it('permits medium risk in fully_applied mode', () => {
      // VULN: fully_applied allows medium risk — the docs say "low and medium"
      // but this means medium-risk families get auto-applied without human review
      expect(isAutoApplyPermitted('fully_applied', 'medium')).toBe(true);
    });

    it('blocks high risk even in fully_applied mode', () => {
      expect(isAutoApplyPermitted('fully_applied', 'high')).toBe(false);
    });

    it('blocks medium risk in auto_apply_low_risk mode', () => {
      expect(isAutoApplyPermitted('auto_apply_low_risk', 'medium')).toBe(false);
    });

    it('blocks all risk levels in observe_only mode', () => {
      expect(isAutoApplyPermitted('observe_only', 'low')).toBe(false);
    });

    it('blocks all risk levels in recommend_only mode', () => {
      expect(isAutoApplyPermitted('recommend_only', 'low')).toBe(false);
    });
  });

  describe('LowRiskAutoApplyService — trusted provider manipulation', () => {

    it('trusts riskProvider blindly — mock returns low for any family', async () => {
      // VULN: no independent verification of risk level
      const { service } = createService();
      const fk = 'high-consequence:family:key';
      const result = await service.inspectAndApply(
        fk,
        makeRecommendation({ familyKey: fk }),
        makeFamilyState({ familyKey: fk, rollingScore: 0.8 }),
        [makeRankedCandidate()],
        'auto_apply_low_risk',
      );
      expect(result).not.toBeNull();
    });

    it('trusts postureProvider blindly — mock returns ADVISORY for FINAL family', async () => {
      // VULN: no cross-check between posture provider and actual family configuration
      const { posture, service } = createService();
      const fk = 'final-posture:family:key';
      // Posture provider lies — says ADVISORY when it should be FINAL
      posture.overrides.set(fk, DecisionPosture.ADVISORY);

      const result = await service.inspectAndApply(
        fk,
        makeRecommendation({ familyKey: fk }),
        makeFamilyState({ familyKey: fk, rollingScore: 0.8 }),
        [makeRankedCandidate()],
        'auto_apply_low_risk',
      );
      expect(result).not.toBeNull();
    });

    it('trusts failureCounter blindly — mock returns 0 when failures exist', async () => {
      // VULN: no independent verification of failure count
      const { service } = createService();
      const result = await service.inspectAndApply(
        'fam',
        makeRecommendation(),
        makeFamilyState({ rollingScore: 0.8 }),
        [makeRankedCandidate()],
        'auto_apply_low_risk',
      );
      expect(result).not.toBeNull();
    });
  });

  describe('LowRiskAutoApplyService — config abuse', () => {

    it('permits rollingScoreThreshold: -1 to auto-apply any score', async () => {
      // VULN: negative threshold means any rollingScore qualifies
      const { service } = createService({ rollingScoreThreshold: -1 });
      const result = await service.inspectAndApply(
        'fam',
        makeRecommendation(),
        makeFamilyState({ rollingScore: 0.0 }),
        [makeRankedCandidate()],
        'auto_apply_low_risk',
      );
      expect(result).not.toBeNull();
    });

    it('creates AutoApplyDecisionRecord but does NOT mutate FamilySelectionState', async () => {
      // VULN: gap between decision and application — record is written but
      // no service actually changes the family's currentCandidateId
      const { writer, service } = createService();
      await service.inspectAndApply(
        'fam',
        makeRecommendation(),
        makeFamilyState({ rollingScore: 0.8 }),
        [makeRankedCandidate()],
        'auto_apply_low_risk',
      );
      expect(writer.decisions).toHaveLength(1);
      // But no FamilySelectionState was mutated — the service doesn't have access to the repo
    });

    it('rejects FINAL posture even with low risk and high score', async () => {
      // Correct behavior: FINAL posture should never auto-apply
      const { posture, service } = createService();
      posture.overrides.set('fam', DecisionPosture.FINAL);

      const result = await service.inspectAndApply(
        'fam',
        makeRecommendation(),
        makeFamilyState({ rollingScore: 0.99 }),
        [makeRankedCandidate()],
        'auto_apply_low_risk',
      );
      expect(result).toBeNull();
    });

    it('rejects EVIDENTIARY posture', async () => {
      const { posture, service } = createService();
      posture.overrides.set('fam', DecisionPosture.EVIDENTIARY);

      const result = await service.inspectAndApply(
        'fam',
        makeRecommendation(),
        makeFamilyState({ rollingScore: 0.99 }),
        [makeRankedCandidate()],
        'auto_apply_low_risk',
      );
      expect(result).toBeNull();
    });
  });
});
