import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Provider } from '@acds/core-types';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, type ColumnDef } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { ProviderForm } from '../../components/forms/ProviderForm';
import { useProviders, useCreateProvider } from '../../hooks/useProviders';
import { formatDate } from '../../lib/formatters';

const columns: ColumnDef<Provider>[] = [
  { key: 'name', header: 'Name', sortable: true, render: (r) => r.name },
  { key: 'vendor', header: 'Vendor', sortable: true, render: (r) => r.vendor },
  {
    key: 'enabled',
    header: 'Status',
    render: (r) => <StatusBadge status={r.enabled ? 'healthy' : 'unhealthy'} label={r.enabled ? 'Enabled' : 'Disabled'} />,
  },
  { key: 'environment', header: 'Environment', render: (r) => r.environment },
  { key: 'createdAt', header: 'Created', sortable: true, render: (r) => formatDate(r.createdAt) },
];

export function ProvidersPage() {
  const navigate = useNavigate();
  const { data: providers = [], isLoading } = useProviders();
  const createMutation = useCreateProvider();
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <PageHeader
        title="Providers"
        actions={
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              padding: '8px 16px',
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            {showForm ? 'Cancel' : 'Add Provider'}
          </button>
        }
      />

      {showForm && (
        <div style={{ marginBottom: '24px' }}>
          <ProviderForm
            onSubmit={(data) => {
              createMutation.mutate(data, {
                onSuccess: () => setShowForm(false),
              });
            }}
            isSubmitting={createMutation.isPending}
          />
        </div>
      )}

      {isLoading ? (
        <p>Loading providers...</p>
      ) : (
        <DataTable
          columns={columns}
          data={providers}
          keyExtractor={(r) => r.id}
          onRowClick={(r) => navigate(`/providers/${r.id}`)}
          emptyMessage="No providers configured"
        />
      )}
    </div>
  );
}
