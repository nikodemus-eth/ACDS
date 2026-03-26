import type { ExecutionRecordReadRepository } from '@acds/grits';
import type { ExecutionRecord } from '@acds/core-types';
import type { Pool } from '@acds/persistence-pg';

function parseFamilyKey(familyKey: string): { application: string; process: string; step: string } {
  const parts = familyKey.split(/[/:.]/);
  return {
    application: parts[0] ?? '',
    process: parts[1] ?? '',
    step: parts[2] ?? '',
  };
}

export class PgExecutionRecordReadRepository implements ExecutionRecordReadRepository {
  constructor(private readonly pool: Pool) {}

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
    return result.rows.map((row) => this.mapRow(row));
  }

  async findByFamily(familyKey: string, limit?: number): Promise<ExecutionRecord[]> {
    const family = parseFamilyKey(familyKey);
    const result = await this.pool.query(
      `SELECT * FROM execution_records
       WHERE application = $1 AND process = $2 AND step = $3
       ORDER BY created_at DESC
       LIMIT $4`,
      [family.application, family.process, family.step, limit ?? 1000],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: Record<string, unknown>): ExecutionRecord {
    return {
      id: row.id as string,
      executionFamily: {
        application: (row.application as string) ?? '',
        process: (row.process as string) ?? '',
        step: (row.step as string) ?? '',
        decisionPosture: ((row.decision_posture as string) ?? 'operational') as ExecutionRecord['executionFamily']['decisionPosture'],
        cognitiveGrade: ((row.cognitive_grade as string) ?? 'standard') as ExecutionRecord['executionFamily']['cognitiveGrade'],
      },
      routingDecisionId: (row.routing_decision_id as string) ?? row.id as string,
      selectedModelProfileId: (row.selected_model_profile_id as string) ?? '',
      selectedTacticProfileId: (row.selected_tactic_profile_id as string) ?? '',
      selectedProviderId: (row.selected_provider_id as string) ?? '',
      status: (row.status as ExecutionRecord['status']) ?? 'failed',
      inputTokens: (row.input_tokens as number | null) ?? null,
      outputTokens: (row.output_tokens as number | null) ?? null,
      latencyMs: (row.latency_ms as number | null) ?? null,
      costEstimate: row.cost_estimate !== null && row.cost_estimate !== undefined
        ? Number(row.cost_estimate)
        : null,
      normalizedOutput: (row.normalized_output as string | null) ?? null,
      errorMessage: (row.error_message as string | null) ?? null,
      fallbackAttempts: Number((row.fallback_attempts as number | string | null) ?? 0),
      createdAt: new Date(row.created_at as string),
      completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
    };
  }
}
