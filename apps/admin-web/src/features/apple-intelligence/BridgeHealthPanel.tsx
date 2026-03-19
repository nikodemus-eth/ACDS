import { StatusBadge } from '../../components/common/StatusBadge';
import type { BridgeHealth } from './appleIntelligenceApi';

interface BridgeHealthPanelProps {
  health: BridgeHealth | undefined;
  isLoading: boolean;
  error: Error | null;
}

export function BridgeHealthPanel({ health, isLoading, error }: BridgeHealthPanelProps) {
  if (isLoading) return <div className="panel"><p>Checking bridge health...</p></div>;
  if (error) return (
    <div className="panel">
      <h2 className="panel__title">Bridge Health</h2>
      <StatusBadge status="unhealthy" label="Unreachable" />
      <div className="panel__note">Could not reach the Apple Intelligence bridge. Is it running on localhost:11435?</div>
    </div>
  );
  if (!health) return null;

  return (
    <div className="panel" aria-live="polite">
      <h2 className="panel__title">Bridge Health</h2>
      <dl className="dl-grid">
        <dt className="dl-grid__term">Status</dt>
        <dd className="dl-grid__value">
          <StatusBadge status={health.status === 'healthy' ? 'healthy' : 'unhealthy'} label={health.status} />
        </dd>
        <dt className="dl-grid__term">Platform</dt>
        <dd className="dl-grid__value">{health.platform}</dd>
        <dt className="dl-grid__term">Version</dt>
        <dd className="dl-grid__value">{health.version}</dd>
      </dl>
    </div>
  );
}
