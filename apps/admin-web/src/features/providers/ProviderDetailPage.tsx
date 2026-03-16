import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import { StatusBadge } from '../../components/common/StatusBadge';
import { ProviderHealthPanel } from './ProviderHealthPanel';
import { useProvider, useDisableProvider, useTestConnection } from '../../hooks/useProviders';
import { formatDate } from '../../lib/formatters';

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
          <div className="page-header__actions">
            <button
              onClick={() => navigate('/providers')}
              className="button button--ghost"
            >
              Back
            </button>
            <button
              onClick={() => testMutation.mutate(id!)}
              disabled={testMutation.isPending}
              className="button button--primary"
            >
              {testMutation.isPending ? 'Testing...' : 'Test Connection'}
            </button>
            {provider.enabled && (
              <button
                onClick={() => disableMutation.mutate(id!)}
                disabled={disableMutation.isPending}
                className="button button--danger"
              >
                {disableMutation.isPending ? 'Disabling...' : 'Disable'}
              </button>
            )}
          </div>
        }
      />

      <div className="details-grid">
        <div className="panel">
          <h3 className="panel__title">Provider Info</h3>
          <div className="info-row">
            <span className="info-row__label">Vendor</span>
            <span className="info-row__value">{provider.vendor}</span>
          </div>
          <div className="info-row">
            <span className="info-row__label">Auth Type</span>
            <span className="info-row__value">{provider.authType}</span>
          </div>
          <div className="info-row">
            <span className="info-row__label">Base URL</span>
            <span className="info-row__value">{provider.baseUrl}</span>
          </div>
          <div className="info-row">
            <span className="info-row__label">Environment</span>
            <span className="info-row__value">{provider.environment}</span>
          </div>
          <div className="info-row">
            <span className="info-row__label">Status</span>
            <StatusBadge
              status={provider.enabled ? 'healthy' : 'unhealthy'}
              label={provider.enabled ? 'Enabled' : 'Disabled'}
            />
          </div>
          <div className="info-row">
            <span className="info-row__label">Created</span>
            <span className="info-row__value">{formatDate(provider.createdAt)}</span>
          </div>
          <div className="info-row">
            <span className="info-row__label">Updated</span>
            <span className="info-row__value">{formatDate(provider.updatedAt)}</span>
          </div>
        </div>

        <ProviderHealthPanel health={provider.health} />
      </div>
    </div>
  );
}
