import type { AuditEventReadRepository } from '@acds/grits';
import type { AuditEvent } from '@acds/audit-ledger';

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

const instance = new InMemoryAuditEventReadRepository();

export function getAuditEventReadRepository(): InMemoryAuditEventReadRepository {
  return instance;
}
