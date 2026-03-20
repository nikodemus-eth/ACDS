import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import { useProvider } from '../../hooks/useProviders';
import { useCapabilities, useTestCapability } from '../../hooks/useCapabilityTest';
import { CapabilityTabs } from './components/CapabilityTabs';
import { InputRenderer } from './components/InputRenderer';
import { OutputRenderer } from './components/OutputRenderer';
import { ExecutionMetadata } from './components/ExecutionMetadata';
import { RawResponseViewer } from './components/RawResponseViewer';
import type { CapabilityTestResponse } from '@acds/core-types';

export function CapabilityTestConsolePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: provider, isLoading: providerLoading } = useProvider(id!);
  const { data: capabilities, isLoading: capsLoading } = useCapabilities(id!);
  const testMutation = useTestCapability();

  const [selectedCapabilityId, setSelectedCapabilityId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<CapabilityTestResponse | null>(null);

  if (providerLoading || capsLoading) return <p>Loading...</p>;
  if (!provider) return <p>Provider not found.</p>;

  const selectedCapability = capabilities?.find((c) => c.capabilityId === selectedCapabilityId);

  function handleExecute(input: Record<string, unknown>, settings?: Record<string, unknown>) {
    if (!selectedCapabilityId) return;
    testMutation.mutate(
      { providerId: id!, capabilityId: selectedCapabilityId, input, settings },
      {
        onSuccess: (result) => setLastResult(result),
        onError: (err) => {
          setLastResult({
            success: false,
            providerId: id!,
            capabilityId: selectedCapabilityId,
            durationMs: 0,
            output: { type: 'error', value: String(err) },
            rawResponse: {},
            error: { code: 'CLIENT_ERROR', message: String(err) },
            timestamp: new Date().toISOString(),
          });
        },
      },
    );
  }

  return (
    <div>
      <PageHeader
        title={`Test: ${provider.name}`}
        actions={
          <button onClick={() => navigate(`/providers/${id}`)} className="button button--ghost">
            Back to Provider
          </button>
        }
      />

      {capabilities && capabilities.length > 0 ? (
        <div className="capability-console">
          <div className="capability-console__sidebar">
            <CapabilityTabs
              capabilities={capabilities}
              selectedId={selectedCapabilityId}
              onSelect={setSelectedCapabilityId}
            />
          </div>

          <div className="capability-console__main">
            {selectedCapability ? (
              <>
                <div className="panel">
                  <h3 className="panel__title">{selectedCapability.label}</h3>
                  <p className="panel__description">{selectedCapability.description}</p>
                  <InputRenderer
                    inputMode={selectedCapability.inputMode}
                    onExecute={handleExecute}
                    isPending={testMutation.isPending}
                  />
                </div>

                {lastResult && (
                  <div className="panel">
                    <h3 className="panel__title">Result</h3>
                    <ExecutionMetadata result={lastResult} />
                    <OutputRenderer
                      type={lastResult.output.type}
                      value={lastResult.output.value}
                    />
                    <RawResponseViewer data={lastResult.rawResponse} />
                  </div>
                )}
              </>
            ) : (
              <div className="panel">
                <p>Select a capability from the left to begin testing.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="panel">
          <p>No capabilities available for this provider.</p>
        </div>
      )}
    </div>
  );
}
