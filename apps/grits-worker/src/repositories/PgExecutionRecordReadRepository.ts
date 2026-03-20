import type { ExecutionRecordReadRepository } from '@acds/grits';
import type { ExecutionRecord } from '@acds/core-types';
import type { Pool } from '@acds/persistence-pg';
import { getGritsPool } from './createGritsPool.js';

export class PgExecutionRecordReadRepository implements ExecutionRecordReadRepository {
  private readonly pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool ?? getGritsPool();
  }

  async findById(id: string): Promise<ExecutionRecord | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM execution_records WHERE id = $1',
      [id],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : undefined;
  }

  async findByTimeRange(since: string, until: string, limit?: number): Promise<ExecutionRecord[]> {
    const result = await this.pool.query(
      `SELECT * FROM execution_records
       WHERE created_at >= $1 AND created_at <= $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [since, until, limit ?? 1000],
    );
    return result.rows.map(this.mapRow);
  }

  async findByFamily(familyKey: string, limit?: number): Promise<ExecutionRecord[]> {
    const parts = familyKey.split('/');
    const application = parts[0] ?? '';
    const process = parts[1] ?? '';
    const step = parts[2] ?? '';

    const result = await this.pool.query(
      `SELECT * FROM execution_records
       WHERE application = $1 AND process = $2 AND step = $3
       ORDER BY created_at DESC
       LIMIT $4`,
      [application, process, step, limit ?? 1000],
    );
    return result.rows.map(this.mapRow);
  }

  private mapRow(row: Record<string, unknown>): ExecutionRecord {
    return {
      id: row.id as string,
      executionFamily: {
        application: row.application as string,
        process: row.process as string,
        step: row.step as string,
        decisionPosture: row.decision_posture as ExecutionRecord['executionFamily']['decisionPosture'],
        cognitiveGrade: row.cognitive_grade as ExecutionRecord['executionFamily']['cognitiveGrade'],
      },
      routingDecisionId: row.routing_decision_id as string,
      selectedModelProfileId: row.selected_model_profile_id as string,
      selectedTacticProfileId: row.selected_tactic_profile_id as string,
      selectedProviderId: row.selected_provider_id as string,
      status: row.status as ExecutionRecord['status'],
      inputTokens: row.input_tokens as number | null,
      outputTokens: row.output_tokens as number | null,
      latencyMs: row.latency_ms as number | null,
      costEstimate: row.cost_estimate as number | null,
      normalizedOutput: row.normalized_output as string | null,
      errorMessage: row.error_message as string | null,
      fallbackAttempts: row.fallback_attempts as number,
      createdAt: new Date(row.created_at as string),
      completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
    };
  }
}

const instance = new PgExecutionRecordReadRepository();

export function getExecutionRecordReadRepository(): PgExecutionRecordReadRepository {
  return instance;
}
