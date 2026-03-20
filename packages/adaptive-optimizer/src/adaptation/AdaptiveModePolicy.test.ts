import { describe, it, expect } from 'vitest';
import { isAutoApplyPermitted, type FamilyRiskLevel } from './AdaptiveModePolicy.js';
import type { AdaptiveMode } from '../selection/AdaptiveSelectionService.js';

describe('isAutoApplyPermitted', () => {
  describe('non-auto-apply modes', () => {
    it('returns false for observe_only regardless of risk', () => {
      expect(isAutoApplyPermitted('observe_only', 'low')).toBe(false);
      expect(isAutoApplyPermitted('observe_only', 'medium')).toBe(false);
      expect(isAutoApplyPermitted('observe_only', 'high')).toBe(false);
    });

    it('returns false for recommend_only regardless of risk', () => {
      expect(isAutoApplyPermitted('recommend_only', 'low')).toBe(false);
      expect(isAutoApplyPermitted('recommend_only', 'medium')).toBe(false);
      expect(isAutoApplyPermitted('recommend_only', 'high')).toBe(false);
    });
  });

  describe('high risk always blocked', () => {
    it('returns false for auto_apply_low_risk + high', () => {
      expect(isAutoApplyPermitted('auto_apply_low_risk', 'high')).toBe(false);
    });

    it('returns false for fully_applied + high', () => {
      expect(isAutoApplyPermitted('fully_applied', 'high')).toBe(false);
    });
  });

  describe('auto_apply_low_risk mode', () => {
    it('returns true for low risk', () => {
      expect(isAutoApplyPermitted('auto_apply_low_risk', 'low')).toBe(true);
    });

    it('returns false for medium risk', () => {
      expect(isAutoApplyPermitted('auto_apply_low_risk', 'medium')).toBe(false);
    });
  });

  describe('fully_applied mode', () => {
    it('returns true for low risk', () => {
      expect(isAutoApplyPermitted('fully_applied', 'low')).toBe(true);
    });

    it('returns true for medium risk', () => {
      expect(isAutoApplyPermitted('fully_applied', 'medium')).toBe(true);
    });
  });

  it('covers all mode + risk combinations systematically', () => {
    const modes: AdaptiveMode[] = ['observe_only', 'recommend_only', 'auto_apply_low_risk', 'fully_applied'];
    const risks: FamilyRiskLevel[] = ['low', 'medium', 'high'];

    const expected: Record<string, boolean> = {
      'observe_only:low': false,
      'observe_only:medium': false,
      'observe_only:high': false,
      'recommend_only:low': false,
      'recommend_only:medium': false,
      'recommend_only:high': false,
      'auto_apply_low_risk:low': true,
      'auto_apply_low_risk:medium': false,
      'auto_apply_low_risk:high': false,
      'fully_applied:low': true,
      'fully_applied:medium': true,
      'fully_applied:high': false,
    };

    for (const mode of modes) {
      for (const risk of risks) {
        expect(isAutoApplyPermitted(mode, risk)).toBe(expected[`${mode}:${risk}`]);
      }
    }
  });
});
