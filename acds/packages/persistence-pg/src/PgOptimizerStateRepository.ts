import type { Pool } from 'pg';
import type { OptimizerStateRepository } from '@acds/adaptive-optimizer';
import type { FamilySelectionState } from '@acds/adaptive-optimizer';
import type { CandidatePerformanceState } from '@acds/adaptive-optimizer';

export class PgOptimizerStateRepository implements OptimizerStateRepository {
  constructor(private readonly pool: Pool) {}

  async getFamilyState(familyKey: string): Promise<FamilySelectionState | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM family_selection_states WHERE family_key = $1',
      [familyKey],
    );
    return result.rows.length > 0 ? this.mapFamilyRow(result.rows[0]) : undefined;
  }

  async saveFamilyState(state: FamilySelectionState): Promise<void> {
    await this.pool.query(
      `INSERT INTO family_selection_states (
         family_key, current_candidate_id, rolling_score, exploration_rate,
         plateau_detected, last_adaptation_at, recent_trend
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (family_key) DO UPDATE SET
         current_candidate_id = EXCLUDED.current_candidate_id,
         rolling_score = EXCLUDED.rolling_score,
         exploration_rate = EXCLUDED.exploration_rate,
         plateau_detected = EXCLUDED.plateau_detected,
         last_adaptation_at = EXCLUDED.last_adaptation_at,
         recent_trend = EXCLUDED.recent_trend`,
      [
        state.familyKey,
        state.currentCandidateId,
        state.rollingScore,
        state.explorationRate,
        state.plateauDetected,
        state.lastAdaptationAt,
        state.recentTrend,
      ],
    );
  }

  async getCandidateStates(familyKey: string): Promise<CandidatePerformanceState[]> {
    const result = await this.pool.query(
      'SELECT * FROM candidate_performance_states WHERE family_key = $1 ORDER BY rolling_score DESC',
      [familyKey],
    );
    return result.rows.map(this.mapCandidateRow);
  }

  async saveCandidateState(state: CandidatePerformanceState): Promise<void> {
    await this.pool.query(
      `INSERT INTO candidate_performance_states (
         candidate_id, family_key, rolling_score, run_count,
         success_rate, average_latency, last_selected_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (candidate_id, family_key) DO UPDATE SET
         rolling_score = EXCLUDED.rolling_score,
         run_count = EXCLUDED.run_count,
         success_rate = EXCLUDED.success_rate,
         average_latency = EXCLUDED.average_latency,
         last_selected_at = EXCLUDED.last_selected_at`,
      [
        state.candidateId,
        state.familyKey,
        state.rollingScore,
        state.runCount,
        state.successRate,
        state.averageLatency,
        state.lastSelectedAt,
      ],
    );
  }

  async listFamilies(): Promise<string[]> {
    const result = await this.pool.query(
      'SELECT family_key FROM family_selection_states ORDER BY family_key',
    );
    return result.rows.map((row: Record<string, unknown>) => row.family_key as string);
  }

  private mapFamilyRow(row: Record<string, unknown>): FamilySelectionState {
    return {
      familyKey: row.family_key as string,
      currentCandidateId: row.current_candidate_id as string,
      rollingScore: parseFloat(row.rolling_score as string),
      explorationRate: parseFloat(row.exploration_rate as string),
      plateauDetected: row.plateau_detected as boolean,
      lastAdaptationAt: row.last_adaptation_at as string,
      recentTrend: row.recent_trend as FamilySelectionState['recentTrend'],
    };
  }

  private mapCandidateRow(row: Record<string, unknown>): CandidatePerformanceState {
    return {
      candidateId: row.candidate_id as string,
      familyKey: row.family_key as string,
      rollingScore: parseFloat(row.rolling_score as string),
      runCount: parseInt(row.run_count as string, 10),
      successRate: parseFloat(row.success_rate as string),
      averageLatency: parseFloat(row.average_latency as string),
      lastSelectedAt: row.last_selected_at as string,
    };
  }
}
