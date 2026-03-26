import type { Pool } from 'pg';
import type { AuditEventWriter, AuditEvent } from '@acds/audit-ledger';

export class PgAuditEventWriter implements AuditEventWriter {
  constructor(private readonly pool: Pool) {}

  async write(event: AuditEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_events (
         id, event_type, actor, action, resource_type, resource_id, application, details, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
      [
        event.id,
        event.eventType,
        event.actor,
        event.action,
        event.resourceType,
        event.resourceId,
        event.application,
        JSON.stringify(event.details),
        event.timestamp,
      ],
    );
  }

  async writeBatch(events: AuditEvent[]): Promise<void> {
    for (const event of events) {
      await this.write(event);
    }
  }
}
