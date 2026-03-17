import { describe, it, expect } from 'vitest';
import { FamilyPerformancePresenter } from './FamilyPerformancePresenter.js';

const now = new Date('2026-03-15T10:00:00Z');

function makeSummary(overrides: Record<string, unknown> = {}) {
  return {
    familyKey: 'app:proc:step',
    rollingScore: 0.8567,
    runCount: 100,
    recentFailureCount: 5,
    metricTrends: [
      { label: 'latency', mean: 0.12345, latest: 0.15678 },
    ],
    lastUpdated: now,
    ...overrides,
  } as any;
}

describe('FamilyPerformancePresenter', () => {
  describe('toView', () => {
    it('formats a summary with rounded scores', () => {
      const view = FamilyPerformancePresenter.toView(makeSummary());
      expect(view.familyKey).toBe('app:proc:step');
      expect(view.rollingScore).toBe(0.8567);
      expect(view.runCount).toBe(100);
      expect(view.recentFailures).toBe(5);
      expect(view.lastUpdated).toBe('2026-03-15T10:00:00.000Z');
    });

    it('rounds metric trend values to 4 decimal places', () => {
      const view = FamilyPerformancePresenter.toView(makeSummary());
      expect(view.metricTrends).toHaveLength(1);
      expect(view.metricTrends[0].label).toBe('latency');
      expect(view.metricTrends[0].mean).toBe(0.1235);
      expect(view.metricTrends[0].latest).toBe(0.1568);
    });

    it('derives trend as insufficient_data when runCount < 5', () => {
      const view = FamilyPerformancePresenter.toView(makeSummary({ runCount: 3 }));
      expect(view.trend).toBe('insufficient_data');
    });

    it('derives trend as declining when failure rate > 0.3', () => {
      const view = FamilyPerformancePresenter.toView(makeSummary({
        runCount: 10,
        recentFailureCount: 5,
      }));
      expect(view.trend).toBe('declining');
    });

    it('derives trend as improving when rollingScore > 0.7 and failure rate <= 0.3', () => {
      const view = FamilyPerformancePresenter.toView(makeSummary({
        runCount: 100,
        recentFailureCount: 5,
        rollingScore: 0.85,
      }));
      expect(view.trend).toBe('improving');
    });

    it('derives trend as stable when rollingScore <= 0.7 and failure rate <= 0.3', () => {
      const view = FamilyPerformancePresenter.toView(makeSummary({
        runCount: 100,
        recentFailureCount: 5,
        rollingScore: 0.65,
      }));
      expect(view.trend).toBe('stable');
    });

    it('handles empty metric trends', () => {
      const view = FamilyPerformancePresenter.toView(makeSummary({ metricTrends: [] }));
      expect(view.metricTrends).toEqual([]);
    });
  });

  describe('toViewList', () => {
    it('formats multiple summaries', () => {
      const summaries = [
        makeSummary({ familyKey: 'a:b:c' }),
        makeSummary({ familyKey: 'd:e:f' }),
      ];
      const views = FamilyPerformancePresenter.toViewList(summaries);
      expect(views).toHaveLength(2);
      expect(views[0].familyKey).toBe('a:b:c');
      expect(views[1].familyKey).toBe('d:e:f');
    });

    it('returns empty array for empty input', () => {
      expect(FamilyPerformancePresenter.toViewList([])).toEqual([]);
    });
  });
});
