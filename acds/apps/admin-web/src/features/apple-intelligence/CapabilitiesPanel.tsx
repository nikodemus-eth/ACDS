import type { BridgeCapabilities } from './appleIntelligenceApi';

interface CapabilitiesPanelProps {
  capabilities: BridgeCapabilities | undefined;
  isLoading: boolean;
}

export function CapabilitiesPanel({ capabilities, isLoading }: CapabilitiesPanelProps) {
  if (isLoading) return <div className="panel"><p>Loading capabilities...</p></div>;
  if (!capabilities) return null;

  return (
    <div className="panel">
      <h3 className="panel__title">Capabilities</h3>
      <div className="info-row">
        <span className="info-row__label">Max Tokens</span>
        <span className="info-row__value">{capabilities.maxTokens.toLocaleString()}</span>
      </div>
      <div className="info-row">
        <span className="info-row__label">Platform</span>
        <span className="info-row__value">{capabilities.platform}</span>
      </div>

      <h4 style={{ margin: '1rem 0 0.5rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Available Models</h4>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {capabilities.models.map((model) => (
          <span key={model} className="badge badge--info">{model}</span>
        ))}
      </div>

      <h4 style={{ margin: '1rem 0 0.5rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Supported Task Types</h4>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {capabilities.supportedTaskTypes.map((taskType) => (
          <span key={taskType} className="badge badge--info">{taskType}</span>
        ))}
      </div>
    </div>
  );
}
