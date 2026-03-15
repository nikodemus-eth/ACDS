import type { ProviderHealth } from '@acds/core-types';
import { StatusBadge } from '../../components/common/StatusBadge';
import { formatDate, formatDuration } from '../../lib/formatters';

interface ProviderHealthPanelProps {
  health: ProviderHealth;
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '8px 0',
  borderBottom: '1px solid #f3f4f6',
};

const labelStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: '13px',
};

const valueStyle: React.CSSProperties = {
  color: '#111827',
  fontSize: '13px',
  fontWeight: 500,
};

export function ProviderHealthPanel({ health }: ProviderHealthPanelProps) {
  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}
    >
      <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>Health</h3>
      <div style={rowStyle}>
        <span style={labelStyle}>Status</span>
        <StatusBadge status={health.status} />
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Last Test</span>
        <span style={valueStyle}>{formatDate(health.lastTestAt)}</span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Last Success</span>
        <span style={valueStyle}>{formatDate(health.lastSuccessAt)}</span>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Latency</span>
        <span style={valueStyle}>{formatDuration(health.latencyMs)}</span>
      </div>
      {health.message && (
        <div style={{ marginTop: '12px', fontSize: '13px', color: '#6b7280' }}>
          {health.message}
        </div>
      )}
    </div>
  );
}
