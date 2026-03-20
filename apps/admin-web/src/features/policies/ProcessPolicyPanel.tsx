import { useState } from 'react';
import type { PolicyRecord } from './policiesApi';
import { PolicyForm } from '../../components/forms/PolicyForm';
import { useUpdatePolicy, useDeletePolicy } from '../../hooks/usePolicies';
import { DataTable, type ColumnDef } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { formatDate } from '../../lib/formatters';

interface ProcessPolicyPanelProps {
  policies: PolicyRecord[];
}

export function ProcessPolicyPanel({ policies }: ProcessPolicyPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const updateMutation = useUpdatePolicy();
  const deleteMutation = useDeletePolicy();

  const editingPolicy = editingId ? policies.find((p) => p.id === editingId) : null;

  const columns: ColumnDef<PolicyRecord>[] = [
    { key: 'application', header: 'Application', sortable: true, render: (r) => r.application ?? '—' },
    { key: 'process', header: 'Process', sortable: true, render: (r) => r.process ?? '—' },
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
    {
      key: 'actions' as keyof PolicyRecord,
      header: '',
      render: (r) => (
        <span className="table-actions">
          <button
            className="button button--small button--ghost"
            onClick={(e) => { e.stopPropagation(); setEditingId(r.id); }}
          >
            Edit
          </button>
          <button
            className="button button--small button--danger-ghost"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete process policy for "${r.application}:${r.process}"?`)) {
                deleteMutation.mutate(r.id);
              }
            }}
          >
            Delete
          </button>
        </span>
      ),
    },
  ];

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
        Process Policies
      </h3>

      {editingPolicy && (
        <div className="form-panel" style={{ marginBottom: '16px' }}>
          <PolicyForm
            initial={editingPolicy}
            onSubmit={(data) => {
              updateMutation.mutate(
                { id: editingPolicy.id, payload: data },
                { onSuccess: () => setEditingId(null) },
              );
            }}
            onCancel={() => setEditingId(null)}
            isSubmitting={updateMutation.isPending}
          />
        </div>
      )}

      <DataTable
        columns={columns}
        data={policies}
        keyExtractor={(r) => r.id}
        emptyMessage="No process-level policies"
      />
    </div>
  );
}
