import type { Pool } from 'pg';
import type { ExecutionRecord } from '@acds/core-types';
import type { ExecutionRecordRepository } from '@acds/execution-orchestrator';

export class PgExecutionRecordRepository implements ExecutionRecordRepository {
  constructor(private readonly pool: Pool) {}

  async create(record: Omit<ExecutionRecord, 'id'>): Promise<ExecutionRecord> {
    const result = await this.pool.query(
      `INSERT INTO execution_records (
         application, process, step, decision_posture, cognitive_grade,
         routing_decision_id, selected_model_profile_id,
         selected_tactic_profile_id, selected_provider_id,
         status, input_tokens, output_tokens, latency_ms,
         cost_estimate, normalized_output, error_message,
         fallback_attempts, completed_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [
        record.executionFamily.application,
        record.executionFamily.process,
        record.executionFamily.step,
        record.executionFamily.decisionPosture,
        record.executionFamily.cognitiveGrade,
        record.routingDecisionId,
        record.selectedModelProfileId,
        record.selectedTacticProfileId,
        record.selectedProviderId,
        record.status,
        record.inputTokens,
        record.outputTokens,
        record.latencyMs,
        record.costEstimate,
        record.normalizedOutput,
        record.errorMessage,
        record.fallbackAttempts,
        record.completedAt,
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<ExecutionRecord | null> {
    const result = await this.pool.query(
      'SELECT * FROM execution_records WHERE id = $1',
      [id],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async findByFamily(familyKey: string, limit = 50): Promise<ExecutionRecord[]> {
    // familyKey format: "application:process:step"
    const parts = familyKey.split(':');
    const application = parts[0] ?? '';
    const process = parts[1] ?? '';
    const step = parts[2] ?? '';

    const result = await this.pool.query(
      `SELECT * FROM execution_records
       WHERE application = $1 AND process = $2 AND step = $3
       ORDER BY created_at DESC
       LIMIT $4`,
      [application, process, step, limit],
    );
    return result.rows.map(this.mapRow);
  }

  async findRecent(limit = 50): Promise<ExecutionRecord[]> {
    const result = await this.pool.query(
      'SELECT * FROM execution_records ORDER BY created_at DESC LIMIT $1',
      [limit],
    );
    return result.rows.map(this.mapRow);
  }

  async update(
    id: string,
    updates: Partial<ExecutionRecord>,
  ): Promise<ExecutionRecord> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIdx++}`);
      values.push(updates.status);
    }
    if (updates.inputTokens !== undefined) {
      setClauses.push(`input_tokens = $${paramIdx++}`);
      values.push(updates.inputTokens);
    }
    if (updates.outputTokens !== undefined) {
      setClauses.push(`output_tokens = $${paramIdx++}`);
      values.push(updates.outputTokens);
    }
    if (updates.latencyMs !== undefined) {
      setClauses.push(`latency_ms = $${paramIdx++}`);
      values.push(updates.latencyMs);
    }
    if (updates.costEstimate !== undefined) {
      setClauses.push(`cost_estimate = $${paramIdx++}`);
      values.push(updates.costEstimate);
    }
    if (updates.normalizedOutput !== undefined) {
      setClauses.push(`normalized_output = $${paramIdx++}`);
      values.push(updates.normalizedOutput);
    }
    if (updates.errorMessage !== undefined) {
      setClauses.push(`error_message = $${paramIdx++}`);
      values.push(updates.errorMessage);
    }
    if (updates.fallbackAttempts !== undefined) {
      setClauses.push(`fallback_attempts = $${paramIdx++}`);
      values.push(updates.fallbackAttempts);
    }
    if (updates.completedAt !== undefined) {
      setClauses.push(`completed_at = $${paramIdx++}`);
      values.push(updates.completedAt);
    }

    if (setClauses.length === 0) {
      const existing = await this.findById(id);
      if (!existing) throw new Error(`ExecutionRecord not found: ${id}`);
      return existing;
    }

    values.push(id);

    const result = await this.pool.query(
      `UPDATE execution_records SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      throw new Error(`ExecutionRecord not found: ${id}`);
    }
    return this.mapRow(result.rows[0]);
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
