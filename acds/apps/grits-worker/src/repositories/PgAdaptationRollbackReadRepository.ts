import type { AdaptationRollbackReadRepository } from '@acds/grits';
import type { AdaptationRollbackRecord, RankingSnapshot } from '@acds/adaptive-optimizer';
import type { Pool } from '@acds/persistence-pg';

function parseSnapshot(raw: unknown, familyKey: string, fallbackTimestamp: string): RankingSnapshot {
  if (raw && typeof raw === 'object') {
    return raw as RankingSnapshot;
  }
  if (typeof raw === 'string' && raw.length > 0) {
    return JSON.parse(raw) as RankingSnapshot;
  }
  return {
    familyKey,
    candidateRankings: [],
    explorationRate: 0,
    capturedAt: fallbackTimestamp,
  };
}

export class PgAdaptationRollbackReadRepository implements AdaptationRollbackReadRepository {
  constructor(private readonly pool: Pool) {}

  async findByFamily(familyKey: string): Promise<AdaptationRollbackRecord[]> {
    const result = await this.pool.query(
      `SELECT * FROM adaptation_rollback_records
       WHERE family_key = $1
       ORDER BY executed_at DESC`,
      [familyKey],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async findById(id: string): Promise<AdaptationRollbackRecord | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM adaptation_rollback_records WHERE id = $1',
      [id],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : undefined;
  }

  private mapRow(row: Record<string, unknown>): AdaptationRollbackRecord {
    const familyKey = row.family_key as string;
    const rolledBackAt = new Date(row.executed_at as string).toISOString();
    return {
      id: row.id as string,
      familyKey,
      targetAdaptationEventId: (row.target_adaptation_event_id as string) ?? (row.snapshot_id as string),
      previousSnapshot: parseSnapshot(row.previous_snapshot, familyKey, rolledBackAt),
      restoredSnapshot: parseSnapshot(row.restored_snapshot, familyKey, rolledBackAt),
      actor: row.executed_by as string,
      reason: row.reason as string,
      rolledBackAt,
    };
  }
}
