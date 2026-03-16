import type { Pool } from 'pg';
import type { AdaptationRollbackRecord } from '@acds/adaptive-optimizer';

export interface RollbackRecordWriter {
  save(record: AdaptationRollbackRecord): Promise<void>;
}

export class PgRollbackRecordWriter implements RollbackRecordWriter {
  constructor(private readonly pool: Pool) {}

  async save(record: AdaptationRollbackRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO adaptation_rollback_records
        (id, family_key, snapshot_id, reason, executed_by, executed_at,
         target_adaptation_event_id, previous_snapshot, restored_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [
        record.id,
        record.familyKey,
        record.targetAdaptationEventId,
        record.reason,
        record.actor,
        record.rolledBackAt,
        record.targetAdaptationEventId,
        JSON.stringify(record.previousSnapshot),
        JSON.stringify(record.restoredSnapshot),
      ],
    );
  }
}
