/**
 * ARGUS-9 Tier 2 — Routing Corruption
 *
 * Tests that routing normalization, selection, and fallback chain
 * construction can be manipulated through crafted inputs.
 */

import { describe, it, expect } from 'vitest';
import {
  RoutingRequestNormalizer,
  DeterministicProfileSelector,
  FallbackChainBuilder,
} from '@acds/routing-engine';
import { ProviderVendor } from '@acds/core-types';
import {
  makeRequest,
  makeProfile,
  makeEffectivePolicy,
} from './_fixtures.js';

describe('ARGUS C1-C4: Routing Corruption', () => {

  describe('RoutingRequestNormalizer', () => {

    it('lowercases application/process/step enabling case-based identity aliasing', () => {
      // VULN: "TestApp" and "testapp" normalize to the same identity
      // This means different applications can alias each other via casing
      const request = makeRequest({
        application: 'TestApp',
        process: 'MyProcess',
        step: 'Step-One',
      });
      const normalizer = new RoutingRequestNormalizer();
      const normalized = normalizer.normalize(request);
      expect(normalized.application).toBe('testapp');
      expect(normalized.process).toBe('myprocess');
      expect(normalized.step).toBe('step-one');
    });

    it('accepts empty string after trimming', () => {
      // VULN: whitespace-only strings normalize to empty string ""
      const request = makeRequest({ application: '   ', process: '  ', step: '  ' });
      const normalizer = new RoutingRequestNormalizer();
      const normalized = normalizer.normalize(request);
      expect(normalized.application).toBe('');
      expect(normalized.process).toBe('');
      expect(normalized.step).toBe('');
    });

    it('accepts extremely long strings', () => {
      // VULN: no length limits on normalized fields
      const longStr = 'a'.repeat(100000);
      const request = makeRequest({ application: longStr });
      const normalizer = new RoutingRequestNormalizer();
      const normalized = normalizer.normalize(request);
      expect(normalized.application.length).toBe(100000);
    });

    it('accepts special characters in process identifiers', () => {
      // VULN: no validation of identifier format — newlines, null bytes accepted
      const request = makeRequest({
        application: 'app\x00name',
        process: 'proc\ness',
        step: 'step\ttab',
      });
      const normalizer = new RoutingRequestNormalizer();
      const normalized = normalizer.normalize(request);
      expect(normalized.application).toContain('\x00');
      expect(normalized.process).toContain('\n');
    });
  });

  describe('DeterministicProfileSelector', () => {
    const selector = new DeterministicProfileSelector();

    it('selects based on array order when no policy default matches', () => {
      // VULN: selection depends on input array order, not a stable criterion
      const profileA = makeProfile({ id: 'profile-a', vendor: ProviderVendor.OPENAI });
      const profileB = makeProfile({ id: 'profile-b', vendor: ProviderVendor.GEMINI });
      const policy = makeEffectivePolicy();

      const resultAB = selector.select([profileA, profileB], policy);
      const resultBA = selector.select([profileB, profileA], policy);
      expect(resultAB?.id).toBe('profile-a');
      expect(resultBA?.id).toBe('profile-b');
    });

    it('returns null for empty eligible list', () => {
      const policy = makeEffectivePolicy();
      expect(selector.select([], policy)).toBeNull();
    });

    it('ignores forceEscalation when no cloud profile exists', () => {
      // VULN: forceEscalation prefers cloudAllowed but falls back to eligible[0]
      const localProfile = makeProfile({ id: 'local', localOnly: true, cloudAllowed: false });
      const policy = makeEffectivePolicy({ forceEscalation: true });
      const result = selector.select([localProfile], policy);
      // Escalation forced but only local available — selects local anyway
      expect(result?.id).toBe('local');
    });
  });

  describe('FallbackChainBuilder', () => {
    const builder = new FallbackChainBuilder();

    it('skips profiles without provider mapping silently', () => {
      // VULN: no warning when eligible profile has no provider — silently excluded from fallback
      const profiles = [
        makeProfile({ id: 'with-provider' }),
        makeProfile({ id: 'no-provider' }),
      ];
      const providerMap = new Map([['with-provider', 'prov-1']]);
      const chain = builder.build(profiles, 'selected-id', 'tactic-1', providerMap);
      expect(chain).toHaveLength(1);
      expect(chain[0].modelProfileId).toBe('with-provider');
    });

    it('reuses same tactic for all fallback entries', () => {
      // VULN: no tactic fallback — same tactic used for all fallback entries
      const profiles = [
        makeProfile({ id: 'selected' }),
        makeProfile({ id: 'fb-1' }),
        makeProfile({ id: 'fb-2' }),
      ];
      const providerMap = new Map([['fb-1', 'prov-1'], ['fb-2', 'prov-2']]);
      const chain = builder.build(profiles, 'selected', 'tactic-original', providerMap);
      expect(chain.every(e => e.tacticProfileId === 'tactic-original')).toBe(true);
    });

    it('produces empty chain when all profiles lack provider mapping', () => {
      // VULN: empty fallback chain means no safety net if primary fails
      const profiles = [
        makeProfile({ id: 'selected' }),
        makeProfile({ id: 'unmapped-1' }),
        makeProfile({ id: 'unmapped-2' }),
      ];
      const providerMap = new Map<string, string>();
      const chain = builder.build(profiles, 'selected', 'tactic-1', providerMap);
      expect(chain).toHaveLength(0);
    });
  });
});
