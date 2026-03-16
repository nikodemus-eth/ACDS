import { PageHeader } from '../../components/common/PageHeader';
import { useBridgeHealth, useBridgeCapabilities } from '../../hooks/useAppleIntelligence';
import { BridgeHealthPanel } from './BridgeHealthPanel';
import { CapabilitiesPanel } from './CapabilitiesPanel';
import { TestExecutionPanel } from './TestExecutionPanel';

export function AppleIntelligencePage() {
  const health = useBridgeHealth();
  const capabilities = useBridgeCapabilities();

  return (
    <div>
      <PageHeader title="Apple Intelligence Bridge" />

      <div className="details-grid">
        <BridgeHealthPanel
          health={health.data}
          isLoading={health.isLoading}
          error={health.error}
        />
        <CapabilitiesPanel
          capabilities={capabilities.data}
          isLoading={capabilities.isLoading}
        />
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <TestExecutionPanel capabilities={capabilities.data} />
      </div>
    </div>
  );
}
