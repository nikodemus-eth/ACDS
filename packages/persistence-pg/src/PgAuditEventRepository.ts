import type { Pool } from 'pg';
import type { AuditEvent } from '@acds/audit-ledger';
import type { AuditEventType } from '@acds/core-types';

export type { AuditEvent };

export interface AuditListFilters {
  eventType?: AuditEventType;
  dateFrom?: Date;
  dateTo?: Date;
  actor?: string;
  resourceType?: string;
  resourceId?: string;
  application?: string;
  limit?: number;
  offset?: number;
}

export interface AuditEventReader {
  findById(id: string): Promise<AuditEvent | null>;
  find(filters: AuditListFilters): Promise<AuditEvent[]>;
}

export class PgAuditEventRepository implements AuditEventReader {
  constructor(private readonly pool: Pool) {}

  async findById(id: string): Promise<AuditEvent | null> {
    const result = await this.pool.query(
      'SELECT * FROM audit_events WHERE id = $1',
      [id],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async find(filters: AuditListFilters): Promise<AuditEvent[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.eventType) {
      conditions.push(`event_type = $${paramIndex++}`);
      params.push(filters.eventType);
    }

    if (filters.dateFrom) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.dateTo);
    }

    if (filters.actor) {
      conditions.push(`actor = $${paramIndex++}`);
      params.push(filters.actor);
    }

    if (filters.resourceType) {
      conditions.push(`resource_type = $${paramIndex++}`);
      params.push(filters.resourceType);
    }

    if (filters.resourceId) {
      conditions.push(`resource_id = $${paramIndex++}`);
      params.push(filters.resourceId);
    }

    if (filters.application) {
      conditions.push(`application = $${paramIndex++}`);
      params.push(filters.application);
    }

    const where = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const limit = filters.limit ?? 100;
    const offset = filters.offset ?? 0;

    const query = `SELECT * FROM audit_events ${where} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await this.pool.query(query, params);
    return result.rows.map(this.mapRow);
  }

  private mapRow(row: Record<string, unknown>): AuditEvent {
    return {
      id: row.id as string,
      eventType: row.event_type as AuditEventType,
      actor: row.actor as string,
      action: (row.action as string) ?? '',
      resourceType: (row.resource_type as string) ?? '',
      resourceId: (row.resource_id as string) ?? '',
      application: (row.application as string) ?? null,
      details: (row.details as Record<string, unknown>) ?? {},
      timestamp: row.created_at as Date,
    };
  }
}
