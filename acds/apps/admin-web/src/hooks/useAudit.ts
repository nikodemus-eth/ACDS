import { useQuery } from '@tanstack/react-query';
import { listAuditEvents, getAuditEvent, type AuditFilters } from '../features/audit/auditApi';

const AUDIT_KEY = ['audit'] as const;

export function useAuditEvents(filters: AuditFilters = {}) {
  return useQuery({
    queryKey: [...AUDIT_KEY, filters],
    queryFn: () => listAuditEvents(filters),
  });
}

export function useAuditEvent(id: string) {
  return useQuery({
    queryKey: [...AUDIT_KEY, id],
    queryFn: () => getAuditEvent(id),
    enabled: !!id,
  });
}
