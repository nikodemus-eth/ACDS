import type { Pool } from 'pg';
import type { FamilyPerformanceSummary } from '@acds/evaluation';

export type { FamilyPerformanceSummary };

export interface FamilyPerformanceReader {
  listAll(): Promise<FamilyPerformanceSummary[]>;
  getByFamilyKey(familyKey: string): Promise<FamilyPerformanceSummary | null>;
}

const BASE_QUERY = `
  SELECT
    fss.family_key,
    fss.rolling_score,
    fss.recent_trend,
    fss.last_adaptation_at,
    COALESCE(SUM(cps.run_count), 0) AS total_run_count
  FROM family_selection_states fss
  LEFT JOIN candidate_performance_states cps
    ON cps.family_key = fss.family_key
`;

export class PgFamilyPerformanceRepository implements FamilyPerformanceReader {
  constructor(private readonly pool: Pool) {}

  async listAll(): Promise<FamilyPerformanceSummary[]> {
    const result = await this.pool.query(
      `${BASE_QUERY}
       GROUP BY fss.family_key, fss.rolling_score, fss.recent_trend, fss.last_adaptation_at
       ORDER BY fss.family_key`,
    );
    return result.rows.map((r) => this.mapRow(r));
  }

  async getByFamilyKey(familyKey: string): Promise<FamilyPerformanceSummary | null> {
    const result = await this.pool.query(
      `${BASE_QUERY}
       WHERE fss.family_key = $1
       GROUP BY fss.family_key, fss.rolling_score, fss.recent_trend, fss.last_adaptation_at`,
      [familyKey],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  private mapRow(row: Record<string, unknown>): FamilyPerformanceSummary {
    return {
      familyKey: row.family_key as string,
      rollingScore: Number(row.rolling_score),
      metricTrends: [],
      runCount: Number(row.total_run_count),
      recentFailureCount: 0,
      lastUpdated: new Date(row.last_adaptation_at as string),
    };
  }
}
