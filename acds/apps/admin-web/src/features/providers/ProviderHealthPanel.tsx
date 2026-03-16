import type { ProviderHealth } from '@acds/core-types';
import { StatusBadge } from '../../components/common/StatusBadge';
import { formatDate, formatDuration } from '../../lib/formatters';

interface ProviderHealthPanelProps {
  health: ProviderHealth;
}

export function ProviderHealthPanel({ health }: ProviderHealthPanelProps) {
  return (
    <div className="panel">
      <h3 className="panel__title">Health</h3>
      <div className="info-row">
        <span className="info-row__label">Status</span>
        <StatusBadge status={health.status} />
      </div>
      <div className="info-row">
        <span className="info-row__label">Last Test</span>
        <span className="info-row__value">{formatDate(health.lastTestAt)}</span>
      </div>
      <div className="info-row">
        <span className="info-row__label">Last Success</span>
        <span className="info-row__value">{formatDate(health.lastSuccessAt)}</span>
      </div>
      <div className="info-row">
        <span className="info-row__label">Latency</span>
        <span className="info-row__value">{formatDuration(health.latencyMs)}</span>
      </div>
      {health.message && (
        <div className="panel__note">{health.message}</div>
      )}
    </div>
  );
}
