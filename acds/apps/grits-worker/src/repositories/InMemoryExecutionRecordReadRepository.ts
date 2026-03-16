import type { ExecutionRecordReadRepository } from '@acds/grits';
import type { ExecutionRecord } from '@acds/core-types';
import { createPool } from '@acds/persistence-pg';

// ---------------------------------------------------------------------------
// InMemory implementation (used by tests)
// ---------------------------------------------------------------------------

export class InMemoryExecutionRecordReadRepository implements ExecutionRecordReadRepository {
  private readonly records: ExecutionRecord[] = [];

  addRecord(record: ExecutionRecord): void {
    this.records.push(record);
  }

  async findById(id: string): Promise<ExecutionRecord | undefined> {
    return this.records.find((r) => r.id === id);
  }

  async findByTimeRange(since: string, until: string, limit?: number): Promise<ExecutionRecord[]> {
    const sinceDate = new Date(since);
    const untilDate = new Date(until);
    const matching = this.records.filter(
      (r) => r.createdAt >= sinceDate && r.createdAt <= untilDate,
    );
    return limit ? matching.slice(0, limit) : matching;
  }

  async findByFamily(familyKey: string, limit?: number): Promise<ExecutionRecord[]> {
    const matching = this.records.filter(
      (r) => `${r.executionFamily.application}/${r.executionFamily.process}/${r.executionFamily.step}` === familyKey,
    );
    return limit ? matching.slice(0, limit) : matching;
  }
}

// ---------------------------------------------------------------------------
// Pg implementation (production)
// ---------------------------------------------------------------------------

function createWorkerPool() {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost:5432/acds');
  return createPool({
    host: databaseUrl.hostname,
    port: databaseUrl.port ? Number(databaseUrl.port) : 5432,
    database: databaseUrl.pathname.replace(/^\//, ''),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    ssl: databaseUrl.searchParams.get('sslmode') === 'require',
  });
}

const pool = createWorkerPool();

export class PgExecutionRecordReadRepository implements ExecutionRecordReadRepository {
  async findById(id: string): Promise<ExecutionRecord | undefined> {
    const result = await pool.query(
      'SELECT * FROM execution_records WHERE id = $1',
      [id],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : undefined;
  }

  async findByTimeRange(since: string, until: string, limit?: number): Promise<ExecutionRecord[]> {
    const result = await pool.query(
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

    const result = await pool.query(
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
