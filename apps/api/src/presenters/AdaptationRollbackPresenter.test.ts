import { describe, it, expect } from 'vitest';
import { AdaptationRollbackPresenter } from './AdaptationRollbackPresenter.js';

function makeRollbackRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rb-1',
    familyKey: 'app:proc:step',
    targetAdaptationEventId: 'evt-1',
    previousSnapshot: {
      candidateRankings: [
        { candidateId: 'c1', score: 0.8 },
        { candidateId: 'c2', score: 0.6 },
      ],
      explorationRate: 0.15,
      capturedAt: '2026-03-15T09:00:00.000Z',
    },
    restoredSnapshot: {
      candidateRankings: [
        { candidateId: 'c1', score: 0.7 },
      ],
      explorationRate: 0.1,
      capturedAt: '2026-03-14T09:00:00.000Z',
    },
    actor: 'admin',
    reason: 'performance regression',
    rolledBackAt: '2026-03-15T10:00:00.000Z',
    ...overrides,
  } as any;
}

describe('AdaptationRollbackPresenter', () => {
  describe('toView', () => {
    it('formats rollback record with correct candidate counts', () => {
      const view = AdaptationRollbackPresenter.toView(makeRollbackRecord());
      expect(view.id).toBe('rb-1');
      expect(view.familyKey).toBe('app:proc:step');
      expect(view.targetAdaptationEventId).toBe('evt-1');
      expect(view.previousSnapshot.candidateCount).toBe(2);
      expect(view.previousSnapshot.explorationRate).toBe(0.15);
      expect(view.previousSnapshot.capturedAt).toBe('2026-03-15T09:00:00.000Z');
      expect(view.restoredSnapshot.candidateCount).toBe(1);
      expect(view.restoredSnapshot.explorationRate).toBe(0.1);
      expect(view.restoredSnapshot.capturedAt).toBe('2026-03-14T09:00:00.000Z');
      expect(view.actor).toBe('admin');
      expect(view.reason).toBe('performance regression');
      expect(view.rolledBackAt).toBe('2026-03-15T10:00:00.000Z');
    });

    it('handles empty candidate rankings', () => {
      const record = makeRollbackRecord({
        previousSnapshot: {
          candidateRankings: [],
          explorationRate: 0,
          capturedAt: '2026-03-15T09:00:00.000Z',
        },
        restoredSnapshot: {
          candidateRankings: [],
          explorationRate: 0,
          capturedAt: '2026-03-14T09:00:00.000Z',
        },
      });
      const view = AdaptationRollbackPresenter.toView(record);
      expect(view.previousSnapshot.candidateCount).toBe(0);
      expect(view.restoredSnapshot.candidateCount).toBe(0);
    });
  });

  describe('toViewList', () => {
    it('formats multiple records', () => {
      const records = [
        makeRollbackRecord({ id: 'rb-1' }),
        makeRollbackRecord({ id: 'rb-2' }),
      ];
      const views = AdaptationRollbackPresenter.toViewList(records);
      expect(views).toHaveLength(2);
      expect(views[0].id).toBe('rb-1');
      expect(views[1].id).toBe('rb-2');
    });

    it('returns empty array for empty input', () => {
      expect(AdaptationRollbackPresenter.toViewList([])).toEqual([]);
    });
  });
});
