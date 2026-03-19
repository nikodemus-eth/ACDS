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
      <h2 className="panel__title">Capabilities</h2>
      <dl className="dl-grid">
        <dt className="dl-grid__term">Max Tokens</dt>
        <dd className="dl-grid__value">{capabilities.maxTokens.toLocaleString()}</dd>
        <dt className="dl-grid__term">Platform</dt>
        <dd className="dl-grid__value">{capabilities.platform}</dd>
      </dl>

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
