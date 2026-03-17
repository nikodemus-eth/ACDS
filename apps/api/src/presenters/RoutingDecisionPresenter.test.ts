import { describe, it, expect } from 'vitest';
import { RoutingDecisionPresenter } from './RoutingDecisionPresenter.js';

const now = new Date('2026-03-15T10:00:00Z');

function makeDecision(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rd-1',
    selectedModelProfileId: 'model-1',
    selectedTacticProfileId: 'tactic-1',
    selectedProviderId: 'prov-1',
    fallbackChain: [
      { modelProfileId: 'model-2', tacticProfileId: 'tactic-2', providerId: 'prov-2', priority: 1 },
    ],
    rationaleId: 'rat-1',
    rationaleSummary: 'Best match found',
    resolvedAt: now,
    ...overrides,
  } as any;
}

describe('RoutingDecisionPresenter', () => {
  describe('toView', () => {
    it('formats a routing decision with all fields', () => {
      const view = RoutingDecisionPresenter.toView(makeDecision());
      expect(view.id).toBe('rd-1');
      expect(view.selectedModelProfileId).toBe('model-1');
      expect(view.selectedTacticProfileId).toBe('tactic-1');
      expect(view.selectedProviderId).toBe('prov-1');
      expect(view.rationaleSummary).toBe('Best match found');
      expect(view.resolvedAt).toBe('2026-03-15T10:00:00.000Z');
    });

    it('formats fallback chain entries', () => {
      const view = RoutingDecisionPresenter.toView(makeDecision());
      expect(view.fallbackChain).toHaveLength(1);
      expect(view.fallbackChain[0]).toEqual({
        modelProfileId: 'model-2',
        tacticProfileId: 'tactic-2',
        providerId: 'prov-2',
        priority: 1,
      });
    });

    it('handles empty fallback chain', () => {
      const view = RoutingDecisionPresenter.toView(makeDecision({ fallbackChain: [] }));
      expect(view.fallbackChain).toEqual([]);
    });

    it('does not expose rationaleId', () => {
      const view = RoutingDecisionPresenter.toView(makeDecision());
      expect((view as any).rationaleId).toBeUndefined();
    });
  });

  describe('toViewList', () => {
    it('formats multiple decisions', () => {
      const decisions = [
        makeDecision({ id: 'rd-1' }),
        makeDecision({ id: 'rd-2' }),
      ];
      const views = RoutingDecisionPresenter.toViewList(decisions);
      expect(views).toHaveLength(2);
      expect(views[0].id).toBe('rd-1');
      expect(views[1].id).toBe('rd-2');
    });

    it('returns empty array for empty input', () => {
      const views = RoutingDecisionPresenter.toViewList([]);
      expect(views).toEqual([]);
    });
  });
});
