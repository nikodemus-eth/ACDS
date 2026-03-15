import type { PolicyRecord } from './policiesApi';
import { DataTable, type ColumnDef } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { formatDate } from '../../lib/formatters';

interface ApplicationPolicyPanelProps {
  policies: PolicyRecord[];
}

const columns: ColumnDef<PolicyRecord>[] = [
  { key: 'application', header: 'Application', sortable: true, render: (r) => r.application ?? '—' },
  {
    key: 'allowedVendors',
    header: 'Allowed Vendors',
    render: (r) => r.allowedVendors.join(', ') || 'All',
  },
  {
    key: 'blockedVendors',
    header: 'Blocked Vendors',
    render: (r) => r.blockedVendors.join(', ') || 'None',
  },
  {
    key: 'enabled',
    header: 'Status',
    render: (r) => (
      <StatusBadge
        status={r.enabled ? 'healthy' : 'unknown'}
        label={r.enabled ? 'Active' : 'Inactive'}
      />
    ),
  },
  { key: 'updatedAt', header: 'Updated', sortable: true, render: (r) => formatDate(r.updatedAt) },
];

export function ApplicationPolicyPanel({ policies }: ApplicationPolicyPanelProps) {
  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
        Application Policies
      </h3>
      <DataTable
        columns={columns}
        data={policies}
        keyExtractor={(r) => r.id}
        emptyMessage="No application-level policies"
      />
    </div>
  );
}
