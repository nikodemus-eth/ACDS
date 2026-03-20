import type { Pool } from 'pg';
import type { ExecutionRecord } from '@acds/core-types';
import type { ExecutionRecordFilters, ExecutionRecordRepository } from '@acds/execution-orchestrator';

export class PgExecutionRecordRepository implements ExecutionRecordRepository {
  constructor(private readonly pool: Pool) {}

  async create(record: Omit<ExecutionRecord, 'id'> & { id?: string }): Promise<ExecutionRecord> {
    const hasId = record.id !== undefined;
    const columns = [
      ...(hasId ? ['id'] : []),
      'application', 'process', 'step', 'decision_posture', 'cognitive_grade',
      'routing_decision_id', 'selected_model_profile_id',
      'selected_tactic_profile_id', 'selected_provider_id',
      'status', 'input_tokens', 'output_tokens', 'latency_ms',
      'cost_estimate', 'normalized_output', 'error_message',
      'fallback_attempts', 'request_id', 'completed_at',
    ];
    const values = [
      ...(hasId ? [record.id] : []),
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
      record.requestId,
      record.completedAt,
    ];
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

    const result = await this.pool.query(
      `INSERT INTO execution_records (${columns.join(', ')})
       VALUES (${placeholders})
       RETURNING *`,
      values,
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
    return result.rows.map((r) => this.mapRow(r));
  }

  async findRecent(limit = 50): Promise<ExecutionRecord[]> {
    const result = await this.pool.query(
      'SELECT * FROM execution_records ORDER BY created_at DESC LIMIT $1',
      [limit],
    );
    return result.rows.map((r) => this.mapRow(r));
  }

  async findFiltered(filters: ExecutionRecordFilters): Promise<ExecutionRecord[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (filters.status) {
      where.push(`status = $${index++}`);
      values.push(filters.status);
    }

    if (filters.application) {
      where.push(`application = $${index++}`);
      values.push(filters.application);
    }

    if (filters.from) {
      where.push(`created_at >= $${index++}`);
      values.push(filters.from);
    }

    if (filters.to) {
      where.push(`created_at <= $${index++}`);
      values.push(filters.to);
    }

    const limit = filters.limit ?? 50;
    values.push(limit);

    const query = `
      SELECT * FROM execution_records
      ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY created_at DESC
      LIMIT $${index}
    `;

    const result = await this.pool.query(query, values);
    return result.rows.map((r) => this.mapRow(r));
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
    if (updates.requestId !== undefined) {
      setClauses.push(`request_id = $${paramIdx++}`);
      values.push(updates.requestId);
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

  async reapStaleExecutions(thresholdMs: number = 3_600_000): Promise<ExecutionRecord[]> {
    const cutoff = new Date(Date.now() - thresholdMs);
    const result = await this.pool.query(
      `UPDATE execution_records
       SET status = 'auto_reaped',
           error_message = 'Stale execution reaped: exceeded ' || $1 || 'ms threshold',
           completed_at = NOW()
       WHERE status IN ('pending', 'running')
         AND created_at < $2
       RETURNING *`,
      [thresholdMs, cutoff],
    );
    return result.rows.map((r) => this.mapRow(r));
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
      requestId: (row.request_id as string) ?? null,
      createdAt: new Date(row.created_at as string),
      completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
    };
  }
}
