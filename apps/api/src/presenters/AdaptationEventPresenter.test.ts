import { describe, it, expect } from 'vitest';
import { AdaptationEventPresenter } from './AdaptationEventPresenter.js';
import type { AdaptationEvent } from '@acds/adaptive-optimizer';

function makeEvent(overrides: Partial<AdaptationEvent> = {}): AdaptationEvent {
  return {
    id: 'evt-1',
    familyKey: 'app/proc/step',
    trigger: 'performance_decline',
    mode: 'supervised',
    previousRanking: [{ candidateId: 'c1', score: 0.8 }],
    newRanking: [{ candidateId: 'c1', score: 0.9 }, { candidateId: 'c2', score: 0.7 }],
    evidenceSummary: '3 failures in last hour',
    createdAt: '2026-03-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('AdaptationEventPresenter', () => {
  describe('toView', () => {
    it('maps all fields correctly', () => {
      const event = makeEvent();
      const view = AdaptationEventPresenter.toView(event);

      expect(view.id).toBe('evt-1');
      expect(view.familyKey).toBe('app/proc/step');
      expect(view.trigger).toBe('performance_decline');
      expect(view.mode).toBe('supervised');
      expect(view.previousRankingCount).toBe(1);
      expect(view.newRankingCount).toBe(2);
      expect(view.evidenceSummary).toBe('3 failures in last hour');
      expect(view.createdAt).toBe('2026-03-15T10:00:00.000Z');
    });

    it('handles empty rankings', () => {
      const event = makeEvent({ previousRanking: [], newRanking: [] });
      const view = AdaptationEventPresenter.toView(event);
      expect(view.previousRankingCount).toBe(0);
      expect(view.newRankingCount).toBe(0);
    });
  });

  describe('toViewList', () => {
    it('maps multiple events', () => {
      const events = [makeEvent({ id: 'e1' }), makeEvent({ id: 'e2' })];
      const views = AdaptationEventPresenter.toViewList(events);
      expect(views).toHaveLength(2);
      expect(views[0].id).toBe('e1');
      expect(views[1].id).toBe('e2');
    });

    it('returns empty array for empty input', () => {
      expect(AdaptationEventPresenter.toViewList([])).toEqual([]);
    });
  });
});
