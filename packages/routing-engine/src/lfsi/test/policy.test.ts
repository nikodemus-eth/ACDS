import { describe, it, expect } from 'vitest';
import { resolvePolicy } from '../policies.js';
import { LfsiError, LFSI_REASON } from '../errors.js';

describe('LFSI Policy Resolution', () => {
  describe('lfsi.local_balanced', () => {
    it('allows tier0 and tier1 with escalation', () => {
      const result = resolvePolicy('lfsi.local_balanced', 'text.summarize');
      expect(result.allowedTiers).toEqual(['tier0', 'tier1']);
      expect(result.allowEscalation).toBe(true);
      expect(result.deniedCapabilities).toEqual([]);
    });

    it('does not deny research.web', () => {
      const result = resolvePolicy('lfsi.local_balanced', 'research.web');
      expect(result.allowedTiers).toContain('tier1');
    });
  });

  describe('lfsi.apple_only', () => {
    it('allows only tier0 with no escalation', () => {
      const result = resolvePolicy('lfsi.apple_only', 'text.summarize');
      expect(result.allowedTiers).toEqual(['tier0']);
      expect(result.allowEscalation).toBe(false);
    });
  });

  describe('lfsi.private_strict', () => {
    it('allows tier0 and tier1 with escalation', () => {
      const result = resolvePolicy('lfsi.private_strict', 'text.summarize');
      expect(result.allowedTiers).toEqual(['tier0', 'tier1']);
      expect(result.allowEscalation).toBe(true);
    });

    it('denies research.web', () => {
      expect(() => resolvePolicy('lfsi.private_strict', 'research.web'))
        .toThrow(LfsiError);

      try {
        resolvePolicy('lfsi.private_strict', 'research.web');
      } catch (e) {
        expect(e).toBeInstanceOf(LfsiError);
        expect((e as LfsiError).reasonCode).toBe(LFSI_REASON.WEB_RESEARCH_NOT_ALLOWED_UNDER_PRIVATE_STRICT);
      }
    });

    it('allows non-web capabilities', () => {
      const result = resolvePolicy('lfsi.private_strict', 'reasoning.deep');
      expect(result.allowedTiers).toContain('tier1');
    });
  });
});
