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
          <dl className="dl-grid">
            <dt className="dl-grid__term">Vendor</dt>
            <dd className="dl-grid__value">{provider.vendor}</dd>
            <dt className="dl-grid__term">Auth Type</dt>
            <dd className="dl-grid__value">{provider.authType}</dd>
            <dt className="dl-grid__term">Base URL</dt>
            <dd className="dl-grid__value">{provider.baseUrl}</dd>
            <dt className="dl-grid__term">Environment</dt>
            <dd className="dl-grid__value">{provider.environment}</dd>
            <dt className="dl-grid__term">Status</dt>
            <dd className="dl-grid__value">
              <StatusBadge
                status={provider.enabled ? 'healthy' : 'unhealthy'}
                label={provider.enabled ? 'Enabled' : 'Disabled'}
              />
            </dd>
            <dt className="dl-grid__term">Created</dt>
            <dd className="dl-grid__value">{formatDate(provider.createdAt)}</dd>
            <dt className="dl-grid__term">Updated</dt>
            <dd className="dl-grid__value">{formatDate(provider.updatedAt)}</dd>
          </dl>
        </div>

        {provider.health && <ProviderHealthPanel health={provider.health} />}
      </div>
    </div>
  );
}
