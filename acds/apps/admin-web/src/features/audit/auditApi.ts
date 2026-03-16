import { apiClient } from '../../lib/apiClient';

export interface AuditEvent {
  id: string;
  eventType: string;
  actor: string;
  application: string;
  action: string;
  target: string;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface AuditFilters {
  eventType?: string;
  dateFrom?: string;
  dateTo?: string;
  actor?: string;
  application?: string;
}

export function listAuditEvents(filters: AuditFilters = {}): Promise<AuditEvent[]> {
  return apiClient.get<AuditEvent[]>('/audit', filters as Record<string, string | undefined>);
}

export function getAuditEvent(id: string): Promise<AuditEvent> {
  return apiClient.get<AuditEvent>(`/audit/${id}`);
}
