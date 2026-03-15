import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import { StatusBadge } from '../../components/common/StatusBadge';
import { ProviderHealthPanel } from './ProviderHealthPanel';
import { useProvider, useDisableProvider, useTestConnection } from '../../hooks/useProviders';
import { formatDate } from '../../lib/formatters';

const infoRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '8px 0',
  borderBottom: '1px solid #f3f4f6',
};

const labelStyle: React.CSSProperties = { color: '#6b7280', fontSize: '13px' };
const valueStyle: React.CSSProperties = { color: '#111827', fontSize: '13px', fontWeight: 500 };

export function ProviderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useProvider(id!);
  const disableMutation = useDisableProvider();
  const testMutation = useTestConnection();

  if (isLoading) return <p>Loading...</p>;
  if (error || !data) return <p>Provider not found.</p>;

  const provider = data;

  return (
    <div>
      <PageHeader
        title={provider.name}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => navigate('/providers')}
              style={{
                padding: '8px 16px',
                backgroundColor: '#f3f4f6',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Back
            </button>
            <button
              onClick={() => testMutation.mutate(id!)}
              disabled={testMutation.isPending}
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
              {testMutation.isPending ? 'Testing...' : 'Test Connection'}
            </button>
            {provider.enabled && (
              <button
                onClick={() => disableMutation.mutate(id!)}
                disabled={disableMutation.isPending}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                {disableMutation.isPending ? 'Disabling...' : 'Disable'}
              </button>
            )}
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>
            Provider Info
          </h3>
          <div style={infoRow}>
            <span style={labelStyle}>Vendor</span>
            <span style={valueStyle}>{provider.vendor}</span>
          </div>
          <div style={infoRow}>
            <span style={labelStyle}>Auth Type</span>
            <span style={valueStyle}>{provider.authType}</span>
          </div>
          <div style={infoRow}>
            <span style={labelStyle}>Base URL</span>
            <span style={valueStyle}>{provider.baseUrl}</span>
          </div>
          <div style={infoRow}>
            <span style={labelStyle}>Environment</span>
            <span style={valueStyle}>{provider.environment}</span>
          </div>
          <div style={infoRow}>
            <span style={labelStyle}>Status</span>
            <StatusBadge
              status={provider.enabled ? 'healthy' : 'unhealthy'}
              label={provider.enabled ? 'Enabled' : 'Disabled'}
            />
          </div>
          <div style={infoRow}>
            <span style={labelStyle}>Created</span>
            <span style={valueStyle}>{formatDate(provider.createdAt)}</span>
          </div>
          <div style={infoRow}>
            <span style={labelStyle}>Updated</span>
            <span style={valueStyle}>{formatDate(provider.updatedAt)}</span>
          </div>
        </div>

        <ProviderHealthPanel health={provider.health} />
      </div>
    </div>
  );
}
