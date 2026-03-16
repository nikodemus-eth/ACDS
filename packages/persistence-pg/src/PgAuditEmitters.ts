import type { Pool } from 'pg';
import type { ApprovalAuditEvent, RollbackAuditEvent } from '@acds/adaptive-optimizer';

export class PgApprovalAuditEmitter {
  constructor(private readonly pool: Pool) {}

  emit(event: ApprovalAuditEvent): void {
    this.pool.query(
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
    ).catch((err) => {
      console.error('[approval-audit] Failed to persist audit event:', err);
    });
  }
}

export class PgRollbackAuditEmitter {
  constructor(private readonly pool: Pool) {}

  emit(event: RollbackAuditEvent): void {
    this.pool.query(
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
    ).catch((err) => {
      console.error('[rollback-audit] Failed to persist audit event:', err);
    });
  }
}
