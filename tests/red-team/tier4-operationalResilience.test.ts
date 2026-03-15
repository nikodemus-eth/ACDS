/**
 * ARGUS-9 Tier 4 — Operational Resilience Failures
 *
 * Tests that the system handles failure conditions gracefully:
 * optimizer errors, empty candidate sets, handler failures, zero-quality floors.
 */

import { describe, it, expect } from 'vitest';
import { select, rankCandidates } from '@acds/adaptive-optimizer';
import { FallbackChainBuilder } from '@acds/routing-engine';
import { ExecutionOutcomePublisher, type ExecutionOutcome } from '@acds/execution-orchestrator';
import {
  makeFamilyState,
  makeCandidateState,
  makeProfile,
} from './_fixtures.js';

describe('ARGUS H1-H4: Operational Resilience Failures', () => {

  describe('AdaptiveSelectionService.select — failure modes', () => {

    it('selects a candidate even when all have rollingScore=0 and successRate=0', () => {
      // VULN: no minimum quality floor — system selects worst-possible candidate
      const family = makeFamilyState();
      const candidates = [
        makeCandidateState({ candidateId: 'a:b:c', rollingScore: 0, successRate: 0 }),
        makeCandidateState({ candidateId: 'd:e:f', rollingScore: 0, successRate: 0 }),
      ];

      const result = select('fam', candidates, family, candidates, 'auto_apply_low_risk');
      expect(result).toBeDefined();
      expect(result.selectedCandidate).toBeDefined();
    });

    it('throws or returns undefined for empty candidates array', () => {
      // Edge case: no candidates at all
      const family = makeFamilyState();

      expect(() =>
        select('fam', [], family, [], 'auto_apply_low_risk')
      ).toThrow();
    });

    it('single candidate is always selected regardless of quality', () => {
      // VULN: no quality gate — even a 0-score candidate is selected when it's the only option
      const family = makeFamilyState();
      const bad = makeCandidateState({
        candidateId: 'bad:bad:bad',
        rollingScore: 0.01,
        successRate: 0.01,
      });

      const result = select('fam', [bad], family, [bad], 'fully_applied');
      expect(result.selectedCandidate.candidate.candidateId).toBe('bad:bad:bad');
    });
  });

  describe('CandidateRanker.rankCandidates — edge cases', () => {

    it('returns empty array for empty candidates', () => {
      const result = rankCandidates([], makeFamilyState());
      expect(result).toHaveLength(0);
    });

    it('ranks candidates with identical scores in stable order', () => {
      const family = makeFamilyState();
      const c1 = makeCandidateState({
        candidateId: 'a:b:c',
        rollingScore: 0.5,
        successRate: 0.5,
        lastSelectedAt: '2026-03-14T12:00:00Z',
      });
      const c2 = makeCandidateState({
        candidateId: 'd:e:f',
        rollingScore: 0.5,
        successRate: 0.5,
        lastSelectedAt: '2026-03-14T12:00:00Z',
      });

      const ranked = rankCandidates([c1, c2], family);
      expect(ranked).toHaveLength(2);
      // Both have same composite — order depends on sort stability
      expect(ranked[0].rank).toBe(1);
      expect(ranked[1].rank).toBe(2);
    });
  });

  describe('FallbackChainBuilder — edge cases', () => {

    it('returns empty chain when all profiles lack provider mapping', () => {
      // VULN: silent skip with no warning
      const builder = new FallbackChainBuilder();
      const profiles = [
        makeProfile({ id: 'p1' }),
        makeProfile({ id: 'p2' }),
      ];
      const providerMap = new Map<string, string>(); // empty — no mappings

      const chain = builder.build(profiles, 'selected', 'tactic-1', providerMap);
      expect(chain).toHaveLength(0);
    });

    it('returns empty chain when only the selected profile has a mapping', () => {
      const builder = new FallbackChainBuilder();
      const profiles = [
        makeProfile({ id: 'selected' }),
        makeProfile({ id: 'fallback-1' }),
      ];
      const providerMap = new Map([['selected', 'prov-1']]);

      // selected is excluded, fallback-1 has no mapping → empty chain
      const chain = builder.build(profiles, 'selected', 'tactic-1', providerMap);
      expect(chain).toHaveLength(0);
    });

    it('reuses same tactic for all fallback entries', () => {
      // VULN: no tactic fallback — same tactic used across all entries
      const builder = new FallbackChainBuilder();
      const profiles = [
        makeProfile({ id: 'p1' }),
        makeProfile({ id: 'p2' }),
        makeProfile({ id: 'p3' }),
      ];
      const providerMap = new Map([
        ['p1', 'prov-1'],
        ['p2', 'prov-2'],
        ['p3', 'prov-3'],
      ]);

      const chain = builder.build(profiles, 'p1', 'tactic-original', providerMap);
      // All fallback entries use 'tactic-original'
      expect(chain.every(e => e.tacticProfileId === 'tactic-original')).toBe(true);
    });
  });

  describe('ExecutionOutcomePublisher — handler resilience', () => {

    it('continues executing remaining handlers when first handler throws', async () => {
      // VULN: handler errors are console.error'd but don't stop other handlers
      const publisher = new ExecutionOutcomePublisher();
      const results: string[] = [];

      publisher.onOutcome(async () => {
        throw new Error('Handler 1 exploded');
      });
      publisher.onOutcome(async () => {
        results.push('handler-2-ran');
      });
      publisher.onOutcome(async () => {
        results.push('handler-3-ran');
      });

      const outcome: ExecutionOutcome = {
        executionId: 'exec-1',
        familyKey: 'fam',
        status: 'success',
        latencyMs: 500,
        adapterResponseSummary: {},
        timestamp: new Date().toISOString(),
      };

      await publisher.publish(outcome);
      // Handler 1 threw, but 2 and 3 still ran
      expect(results).toEqual(['handler-2-ran', 'handler-3-ran']);
    });

    it('permits duplicate handler registration', () => {
      // VULN: no dedup — same function registered twice runs twice
      const publisher = new ExecutionOutcomePublisher();
      let count = 0;
      const handler = async () => { count++; };

      publisher.onOutcome(handler);
      publisher.onOutcome(handler);

      const outcome: ExecutionOutcome = {
        executionId: 'exec-1',
        familyKey: 'fam',
        status: 'success',
        latencyMs: 500,
        adapterResponseSummary: {},
        timestamp: new Date().toISOString(),
      };

      return publisher.publish(outcome).then(() => {
        expect(count).toBe(2);
      });
    });

    it('handles many registered handlers without failure', async () => {
      // Stress test: 100 handlers
      const publisher = new ExecutionOutcomePublisher();
      let count = 0;

      for (let i = 0; i < 100; i++) {
        publisher.onOutcome(async () => { count++; });
      }

      const outcome: ExecutionOutcome = {
        executionId: 'exec-1',
        familyKey: 'fam',
        status: 'success',
        latencyMs: 500,
        adapterResponseSummary: {},
        timestamp: new Date().toISOString(),
      };

      await publisher.publish(outcome);
      expect(count).toBe(100);
    });
  });
});
