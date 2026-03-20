import { describe, it, expect } from 'vitest';
import { ConfidenceEscalationResolver } from './ConfidenceEscalationResolver.js';
import { CognitiveGrade } from '@acds/core-types';

describe('ConfidenceEscalationResolver', () => {
  describe('resolve', () => {
    const resolver = new ConfidenceEscalationResolver();

    it('returns FRONTIER for very low confidence (< 0.3)', () => {
      expect(resolver.resolve(0.0)).toBe(CognitiveGrade.FRONTIER);
      expect(resolver.resolve(0.1)).toBe(CognitiveGrade.FRONTIER);
      expect(resolver.resolve(0.29)).toBe(CognitiveGrade.FRONTIER);
    });

    it('returns ENHANCED for low confidence (0.3 <= c < 0.6)', () => {
      expect(resolver.resolve(0.3)).toBe(CognitiveGrade.ENHANCED);
      expect(resolver.resolve(0.45)).toBe(CognitiveGrade.ENHANCED);
      expect(resolver.resolve(0.59)).toBe(CognitiveGrade.ENHANCED);
    });

    it('returns STANDARD for medium confidence (0.6 <= c < 0.8)', () => {
      expect(resolver.resolve(0.6)).toBe(CognitiveGrade.STANDARD);
      expect(resolver.resolve(0.7)).toBe(CognitiveGrade.STANDARD);
      expect(resolver.resolve(0.79)).toBe(CognitiveGrade.STANDARD);
    });

    it('returns BASIC for high confidence (>= 0.8)', () => {
      expect(resolver.resolve(0.8)).toBe(CognitiveGrade.BASIC);
      expect(resolver.resolve(0.9)).toBe(CognitiveGrade.BASIC);
      expect(resolver.resolve(1.0)).toBe(CognitiveGrade.BASIC);
    });
  });

  describe('resolve with custom config', () => {
    it('uses custom thresholds', () => {
      const resolver = new ConfidenceEscalationResolver({
        frontierThreshold: 0.2,
        enhancedThreshold: 0.4,
        standardThreshold: 0.6,
      });

      expect(resolver.resolve(0.1)).toBe(CognitiveGrade.FRONTIER);
      expect(resolver.resolve(0.3)).toBe(CognitiveGrade.ENHANCED);
      expect(resolver.resolve(0.5)).toBe(CognitiveGrade.STANDARD);
      expect(resolver.resolve(0.7)).toBe(CognitiveGrade.BASIC);
    });

    it('uses partial custom config and defaults for the rest', () => {
      const resolver = new ConfidenceEscalationResolver({
        frontierThreshold: 0.1,
      });

      // frontierThreshold is custom 0.1
      expect(resolver.resolve(0.05)).toBe(CognitiveGrade.FRONTIER);
      expect(resolver.resolve(0.15)).toBe(CognitiveGrade.ENHANCED); // uses default 0.6
    });
  });

  describe('shouldEscalate', () => {
    const resolver = new ConfidenceEscalationResolver();

    it('returns true when recommended grade is higher than current', () => {
      // confidence 0.1 -> FRONTIER, current is BASIC -> should escalate
      expect(resolver.shouldEscalate(0.1, CognitiveGrade.BASIC)).toBe(true);
    });

    it('returns true when escalating from STANDARD to ENHANCED', () => {
      // confidence 0.4 -> ENHANCED, current is STANDARD -> should escalate
      expect(resolver.shouldEscalate(0.4, CognitiveGrade.STANDARD)).toBe(true);
    });

    it('returns false when recommended grade is lower than or equal to current', () => {
      // confidence 0.9 -> BASIC, current is STANDARD -> no escalation needed
      expect(resolver.shouldEscalate(0.9, CognitiveGrade.STANDARD)).toBe(false);
    });

    it('returns false when already at the recommended grade', () => {
      // confidence 0.7 -> STANDARD, current is STANDARD -> no escalation
      expect(resolver.shouldEscalate(0.7, CognitiveGrade.STANDARD)).toBe(false);
    });

    it('returns false when already at FRONTIER', () => {
      // confidence 0.1 -> FRONTIER, current is FRONTIER -> no escalation
      expect(resolver.shouldEscalate(0.1, CognitiveGrade.FRONTIER)).toBe(false);
    });

    it('returns true when escalating from BASIC to FRONTIER', () => {
      expect(resolver.shouldEscalate(0.05, CognitiveGrade.BASIC)).toBe(true);
    });

    it('returns false when high confidence and already ENHANCED', () => {
      // confidence 0.9 -> BASIC, current is ENHANCED -> no escalation
      expect(resolver.shouldEscalate(0.9, CognitiveGrade.ENHANCED)).toBe(false);
    });

    it('handles SPECIALIZED grade in the grade order', () => {
      // confidence 0.1 -> FRONTIER, SPECIALIZED is above FRONTIER in the order
      expect(resolver.shouldEscalate(0.1, CognitiveGrade.SPECIALIZED)).toBe(false);
    });
  });
});
