import type { AdaptationRollbackReadRepository } from '@acds/grits';
import type { AdaptationRollbackRecord } from '@acds/adaptive-optimizer';
import { createPool } from '@acds/persistence-pg';

// ---------------------------------------------------------------------------
// InMemory implementation (used by tests)
// ---------------------------------------------------------------------------

export class InMemoryAdaptationRollbackReadRepository implements AdaptationRollbackReadRepository {
  private readonly records: AdaptationRollbackRecord[] = [];

  addRecord(record: AdaptationRollbackRecord): void {
    this.records.push(record);
  }

  async findByFamily(familyKey: string): Promise<AdaptationRollbackRecord[]> {
    return this.records.filter((r) => r.familyKey === familyKey);
  }

  async findById(id: string): Promise<AdaptationRollbackRecord | undefined> {
    return this.records.find((r) => r.id === id);
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

export class PgAdaptationRollbackReadRepository implements AdaptationRollbackReadRepository {
  async findByFamily(familyKey: string): Promise<AdaptationRollbackRecord[]> {
    const result = await pool.query(
      `SELECT * FROM adaptation_rollback_records
       WHERE family_key = $1
       ORDER BY executed_at DESC`,
      [familyKey],
    );
    return result.rows.map(this.mapRow);
  }

  async findById(id: string): Promise<AdaptationRollbackRecord | undefined> {
    const result = await pool.query(
      'SELECT * FROM adaptation_rollback_records WHERE id = $1',
      [id],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : undefined;
  }

  private mapRow(row: Record<string, unknown>): AdaptationRollbackRecord {
    return {
      id: row.id as string,
      familyKey: row.family_key as string,
      targetAdaptationEventId: row.snapshot_id as string,
      previousSnapshot: typeof row.previous_snapshot === 'string'
        ? JSON.parse(row.previous_snapshot)
        : (row.previous_snapshot as AdaptationRollbackRecord['previousSnapshot']),
      restoredSnapshot: typeof row.restored_snapshot === 'string'
        ? JSON.parse(row.restored_snapshot)
        : (row.restored_snapshot as AdaptationRollbackRecord['restoredSnapshot']),
      actor: row.executed_by as string,
      reason: row.reason as string,
      rolledBackAt: row.executed_at as string,
    };
  }
}

const instance = new PgAdaptationRollbackReadRepository();

export function getAdaptationRollbackReadRepository(): PgAdaptationRollbackReadRepository {
  return instance;
}
