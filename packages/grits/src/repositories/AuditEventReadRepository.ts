import type { AuditEvent } from '@acds/audit-ledger';

/**
 * Read-only repository for audit events.
 * GRITS uses this to verify audit trail completeness and
 * scan for secret exposure in event details.
 */
export interface AuditEventReadRepository {
  /** Retrieve all audit events for a specific resource. */
  findByResourceId(resourceId: string): Promise<AuditEvent[]>;

  /** Retrieve audit events within a time range (ISO-8601 strings). */
  findByTimeRange(since: string, until: string, limit?: number): Promise<AuditEvent[]>;

  /** Retrieve audit events of a specific type. */
  findByEventType(eventType: string, limit?: number): Promise<AuditEvent[]>;
}
