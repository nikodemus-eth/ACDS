import type { AuditEventReadRepository } from '@acds/grits';
import type { AuditEvent } from '@acds/audit-ledger';
import { createPool } from '@acds/persistence-pg';

// ---------------------------------------------------------------------------
// InMemory implementation (used by tests)
// ---------------------------------------------------------------------------

export class InMemoryAuditEventReadRepository implements AuditEventReadRepository {
  private readonly events: AuditEvent[] = [];

  addEvent(event: AuditEvent): void {
    this.events.push(event);
  }

  async findByResourceId(resourceId: string): Promise<AuditEvent[]> {
    return this.events.filter((e) => e.resourceId === resourceId);
  }

  async findByTimeRange(since: string, until: string, limit?: number): Promise<AuditEvent[]> {
    const sinceDate = new Date(since);
    const untilDate = new Date(until);
    const matching = this.events.filter(
      (e) => e.timestamp >= sinceDate && e.timestamp <= untilDate,
    );
    return limit ? matching.slice(0, limit) : matching;
  }

  async findByEventType(eventType: string, limit?: number): Promise<AuditEvent[]> {
    const matching = this.events.filter((e) => e.eventType === eventType);
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

export class PgAuditEventReadRepository implements AuditEventReadRepository {
  async findByResourceId(resourceId: string): Promise<AuditEvent[]> {
    const result = await pool.query(
      `SELECT * FROM audit_events
       WHERE resource_id = $1
       ORDER BY created_at DESC`,
      [resourceId],
    );
    return result.rows.map(this.mapRow);
  }

  async findByTimeRange(since: string, until: string, limit?: number): Promise<AuditEvent[]> {
    const result = await pool.query(
      `SELECT * FROM audit_events
       WHERE created_at >= $1 AND created_at <= $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [since, until, limit ?? 1000],
    );
    return result.rows.map(this.mapRow);
  }

  async findByEventType(eventType: string, limit?: number): Promise<AuditEvent[]> {
    const result = await pool.query(
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
