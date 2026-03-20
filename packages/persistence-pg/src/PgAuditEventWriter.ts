import type { Pool } from 'pg';
import type { AuditEvent, AuditEventWriter } from '@acds/audit-ledger';

/**
 * Production PostgreSQL implementation of the AuditEventWriter interface.
 * Writes audit events to the audit_events table.
 */
export class PgAuditEventWriter implements AuditEventWriter {
  constructor(private readonly pool: Pool) {}

  async write(event: AuditEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_events (id, event_type, actor, action, resource_type, resource_id, application, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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
    if (events.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const event of events) {
        await client.query(
          `INSERT INTO audit_events (id, event_type, actor, action, resource_type, resource_id, application, details, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
