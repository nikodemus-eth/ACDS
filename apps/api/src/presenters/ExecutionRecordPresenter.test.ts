import { describe, it, expect } from 'vitest';
import { ExecutionRecordPresenter } from './ExecutionRecordPresenter.js';

const now = new Date('2026-03-15T10:00:00Z');
const completed = new Date('2026-03-15T10:01:00Z');

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exec-1',
    executionFamily: {
      application: 'myapp',
      process: 'myproc',
      step: 'mystep',
      decisionPosture: 'operational',
      cognitiveGrade: 'standard',
    },
    routingDecisionId: 'rd-1',
    selectedModelProfileId: 'model-1',
    selectedTacticProfileId: 'tactic-1',
    selectedProviderId: 'prov-1',
    status: 'succeeded',
    inputTokens: 100,
    outputTokens: 200,
    latencyMs: 500,
    costEstimate: 0.01,
    normalizedOutput: 'output text',
    errorMessage: null,
    fallbackAttempts: 0,
    createdAt: now,
    completedAt: completed,
    ...overrides,
  } as any;
}

describe('ExecutionRecordPresenter', () => {
  describe('toView', () => {
    it('formats a complete execution record', () => {
      const view = ExecutionRecordPresenter.toView(makeRecord());
      expect(view.id).toBe('exec-1');
      expect(view.status).toBe('succeeded');
      expect(view.createdAt).toBe('2026-03-15T10:00:00.000Z');
      expect(view.completedAt).toBe('2026-03-15T10:01:00.000Z');
      expect(view.inputTokens).toBe(100);
      expect(view.outputTokens).toBe(200);
      expect(view.latencyMs).toBe(500);
      expect(view.costEstimate).toBe(0.01);
    });

    it('formats executionFamily correctly', () => {
      const view = ExecutionRecordPresenter.toView(makeRecord());
      expect(view.executionFamily).toEqual({
        application: 'myapp',
        process: 'myproc',
        step: 'mystep',
        decisionPosture: 'operational',
        cognitiveGrade: 'standard',
      });
    });

    it('returns null for completedAt when not set', () => {
      const view = ExecutionRecordPresenter.toView(makeRecord({ completedAt: undefined }));
      expect(view.completedAt).toBeNull();
    });

    it('returns null for completedAt when null', () => {
      const view = ExecutionRecordPresenter.toView(makeRecord({ completedAt: null }));
      expect(view.completedAt).toBeNull();
    });
  });

  describe('toViewList', () => {
    it('formats multiple records', () => {
      const records = [makeRecord({ id: 'e1' }), makeRecord({ id: 'e2' })];
      const views = ExecutionRecordPresenter.toViewList(records);
      expect(views).toHaveLength(2);
      expect(views[0].id).toBe('e1');
      expect(views[1].id).toBe('e2');
    });

    it('returns empty array for empty input', () => {
      expect(ExecutionRecordPresenter.toViewList([])).toEqual([]);
    });
  });

  describe('toDetailView', () => {
    it('includes rationaleSummary and fallbackHistory', () => {
      const view = ExecutionRecordPresenter.toDetailView(makeRecord());
      expect(view.rationaleSummary).toContain('myapp/myproc/mystep');
      expect(view.rationaleSummary).toContain('provider prov-1');
      expect(view.rationaleSummary).toContain('model profile model-1');
      expect(view.rationaleSummary).toContain('tactic tactic-1');
      expect(view.fallbackHistory).toEqual([]);
    });

    it('includes fallback attempts in rationale when > 0', () => {
      const view = ExecutionRecordPresenter.toDetailView(makeRecord({ fallbackAttempts: 3 }));
      expect(view.rationaleSummary).toContain('3 fallback attempt(s)');
    });

    it('includes posture and grade in rationale', () => {
      const view = ExecutionRecordPresenter.toDetailView(makeRecord());
      expect(view.rationaleSummary).toContain('Posture: operational');
      expect(view.rationaleSummary).toContain('grade: standard');
    });

    it('omits fallback mention when fallbackAttempts is 0', () => {
      const view = ExecutionRecordPresenter.toDetailView(makeRecord({ fallbackAttempts: 0 }));
      expect(view.rationaleSummary).not.toContain('fallback attempt');
    });
  });
});
