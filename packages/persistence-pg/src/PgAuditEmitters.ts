import type { Pool } from 'pg';
import type { ApprovalAuditEvent, RollbackAuditEvent } from '@acds/adaptive-optimizer';

export class PgApprovalAuditEmitter {
  constructor(private readonly pool: Pool) {}

  async emit(event: ApprovalAuditEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_events (event_type, actor, action, resource_type, resource_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        event.type,
        event.actor ?? 'system',
        event.type,
        'approval',
        event.approvalId,
        JSON.stringify({
          familyKey: event.familyKey,
          reason: event.reason,
          timestamp: event.timestamp,
        }),
      ],
    );
  }
}

export class PgRollbackAuditEmitter {
  constructor(private readonly pool: Pool) {}

  async emit(event: RollbackAuditEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_events (event_type, actor, action, resource_type, resource_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        event.type,
        event.actor,
        event.type,
        'rollback',
        event.rollbackId,
        JSON.stringify({
          familyKey: event.familyKey,
          targetAdaptationEventId: event.targetAdaptationEventId,
          reason: event.reason,
          timestamp: event.timestamp,
        }),
      ],
    );
  }
}
