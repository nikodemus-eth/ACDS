import type { AuditEventReadRepository } from '@acds/grits';
import type { AuditEvent } from '@acds/audit-ledger';
import type { Pool } from '@acds/persistence-pg';
import { getGritsPool } from './createGritsPool.js';

export class PgAuditEventReadRepository implements AuditEventReadRepository {
  private readonly pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool ?? getGritsPool();
  }

  async findByResourceId(resourceId: string): Promise<AuditEvent[]> {
    const result = await this.pool.query(
      `SELECT * FROM audit_events
       WHERE resource_id = $1
       ORDER BY created_at DESC`,
      [resourceId],
    );
    return result.rows.map(this.mapRow);
  }

  async findByTimeRange(since: string, until: string, limit?: number): Promise<AuditEvent[]> {
    const result = await this.pool.query(
      `SELECT * FROM audit_events
       WHERE created_at >= $1 AND created_at <= $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [since, until, limit ?? 1000],
    );
    return result.rows.map(this.mapRow);
  }

  async findByEventType(eventType: string, limit?: number): Promise<AuditEvent[]> {
    const result = await this.pool.query(
      `SELECT * FROM audit_events
       WHERE event_type = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [eventType, limit ?? 1000],
    );
    return result.rows.map(this.mapRow);
  }

  private mapRow(row: Record<string, unknown>): AuditEvent {
    return {
      id: row.id as string,
      eventType: row.event_type as AuditEvent['eventType'],
      actor: row.actor as string,
      action: row.action as string,
      resourceType: row.resource_type as string,
      resourceId: row.resource_id as string,
      application: (row.application as string) ?? null,
      details: (row.details as Record<string, unknown>) ?? {},
      timestamp: new Date(row.created_at as string),
    };
  }
}

const instance = new PgAuditEventReadRepository();

export function getAuditEventReadRepository(): PgAuditEventReadRepository {
  return instance;
}
