import { describe, it, expect } from 'vitest';
import { AdaptationApprovalPresenter } from './AdaptationApprovalPresenter.js';
import type { AdaptationApproval } from '@acds/adaptive-optimizer';

function makeApproval(overrides: Partial<AdaptationApproval> = {}): AdaptationApproval {
  return {
    id: 'apr-1',
    familyKey: 'app/proc/step',
    recommendationId: 'rec-1',
    status: 'pending',
    submittedAt: '2026-03-15T10:00:00.000Z',
    decidedAt: undefined,
    decidedBy: undefined,
    reason: undefined,
    expiresAt: '2026-03-16T10:00:00.000Z',
    ...overrides,
  };
}

describe('AdaptationApprovalPresenter', () => {
  describe('toView', () => {
    it('maps pending approval with nullable fields as null', () => {
      const view = AdaptationApprovalPresenter.toView(makeApproval());

      expect(view.id).toBe('apr-1');
      expect(view.familyKey).toBe('app/proc/step');
      expect(view.recommendationId).toBe('rec-1');
      expect(view.status).toBe('pending');
      expect(view.submittedAt).toBe('2026-03-15T10:00:00.000Z');
      expect(view.decidedAt).toBeNull();
      expect(view.decidedBy).toBeNull();
      expect(view.reason).toBeNull();
      expect(view.expiresAt).toBe('2026-03-16T10:00:00.000Z');
    });

    it('maps approved approval with decided fields populated', () => {
      const view = AdaptationApprovalPresenter.toView(makeApproval({
        status: 'approved',
        decidedAt: '2026-03-15T12:00:00.000Z',
        decidedBy: 'admin@example.com',
        reason: 'Looks good',
      }));

      expect(view.status).toBe('approved');
      expect(view.decidedAt).toBe('2026-03-15T12:00:00.000Z');
      expect(view.decidedBy).toBe('admin@example.com');
      expect(view.reason).toBe('Looks good');
    });
  });

  describe('toViewList', () => {
    it('maps multiple approvals', () => {
      const approvals = [makeApproval({ id: 'a1' }), makeApproval({ id: 'a2' })];
      const views = AdaptationApprovalPresenter.toViewList(approvals);
      expect(views).toHaveLength(2);
      expect(views[0].id).toBe('a1');
      expect(views[1].id).toBe('a2');
    });

    it('returns empty array for empty input', () => {
      expect(AdaptationApprovalPresenter.toViewList([])).toEqual([]);
    });
  });
});
