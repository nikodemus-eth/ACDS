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
      <h3 className="panel__title">Bridge Health</h3>
      <StatusBadge status="unhealthy" label="Unreachable" />
      <div className="panel__note">Could not reach the Apple Intelligence bridge. Is it running on localhost:11435?</div>
    </div>
  );
  if (!health) return null;

  return (
    <div className="panel">
      <h3 className="panel__title">Bridge Health</h3>
      <div className="info-row">
        <span className="info-row__label">Status</span>
        <StatusBadge status={health.status === 'healthy' ? 'healthy' : 'unhealthy'} label={health.status} />
      </div>
      <div className="info-row">
        <span className="info-row__label">Platform</span>
        <span className="info-row__value">{health.platform}</span>
      </div>
      <div className="info-row">
        <span className="info-row__label">Version</span>
        <span className="info-row__value">{health.version}</span>
      </div>
    </div>
  );
}
