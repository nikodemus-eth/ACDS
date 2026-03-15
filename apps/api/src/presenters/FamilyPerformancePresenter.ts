// ---------------------------------------------------------------------------
// FamilyPerformancePresenter - formats family summaries for API responses
// ---------------------------------------------------------------------------

import type { FamilyPerformanceSummary, MetricTrend } from '@acds/evaluation';

/**
 * Public shape returned to API clients for family performance summaries.
 */
export interface FamilyPerformanceView {
  familyKey: string;
  rollingScore: number;
  trend: string;
  runCount: number;
  recentFailures: number;
  metricTrends: MetricTrendView[];
  lastUpdated: string;
}

export interface MetricTrendView {
  label: string;
  mean: number;
  latest: number;
}

export class FamilyPerformancePresenter {
  /**
   * Formats a single FamilyPerformanceSummary for the API response.
   * Derives trend from rolling score and recent failures.
   */
  static toView(summary: FamilyPerformanceSummary): FamilyPerformanceView {
    const trend = FamilyPerformancePresenter.deriveTrend(summary);

    return {
      familyKey: summary.familyKey,
      rollingScore: Math.round(summary.rollingScore * 10000) / 10000,
      trend,
      runCount: summary.runCount,
      recentFailures: summary.recentFailureCount,
      metricTrends: summary.metricTrends.map(FamilyPerformancePresenter.toMetricTrendView),
      lastUpdated: summary.lastUpdated.toISOString(),
    };
  }

  /**
   * Formats a list of FamilyPerformanceSummary entities.
   */
  static toViewList(summaries: FamilyPerformanceSummary[]): FamilyPerformanceView[] {
    return summaries.map(FamilyPerformancePresenter.toView);
  }

  /**
   * Derives a human-readable trend label from summary data.
   */
  private static deriveTrend(summary: FamilyPerformanceSummary): string {
    if (summary.runCount < 5) return 'insufficient_data';
    const failureRate = summary.recentFailureCount / summary.runCount;
    if (failureRate > 0.3) return 'declining';
    if (summary.rollingScore > 0.7) return 'improving';
    return 'stable';
  }

  private static toMetricTrendView(trend: MetricTrend): MetricTrendView {
    return {
      label: trend.label,
      mean: Math.round(trend.mean * 10000) / 10000,
      latest: Math.round(trend.latest * 10000) / 10000,
    };
  }
}
