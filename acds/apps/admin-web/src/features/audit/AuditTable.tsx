import type { AuditEvent } from './auditApi';
import { DataTable, type ColumnDef } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { formatDate, truncate } from '../../lib/formatters';

interface AuditTableProps {
  events: AuditEvent[];
}

const columns: ColumnDef<AuditEvent>[] = [
  { key: 'timestamp', header: 'Time', sortable: true, render: (r) => formatDate(r.timestamp) },
  {
    key: 'eventType',
    header: 'Type',
    sortable: true,
    render: (r) => <StatusBadge status="unknown" label={r.eventType} />,
  },
  { key: 'actor', header: 'Actor', sortable: true, render: (r) => r.actor },
  { key: 'application', header: 'Application', sortable: true, render: (r) => r.application },
  { key: 'action', header: 'Action', render: (r) => r.action },
  { key: 'target', header: 'Target', render: (r) => truncate(r.target, 40) },
];

export function AuditTable({ events }: AuditTableProps) {
  return (
    <DataTable
      columns={columns}
      data={events}
      keyExtractor={(r) => r.id}
      emptyMessage="No audit events found"
    />
  );
}
