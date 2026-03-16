import { useState } from 'react';
import type { BridgeCapabilities, ExecuteResponse } from './appleIntelligenceApi';
import { useExecuteBridgePrompt } from '../../hooks/useAppleIntelligence';

interface TestExecutionPanelProps {
  capabilities: BridgeCapabilities | undefined;
}

export function TestExecutionPanel({ capabilities }: TestExecutionPanelProps) {
  const executeMutation = useExecuteBridgePrompt();
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<ExecuteResponse | null>(null);

  const models = capabilities?.models ?? [];
  const selectedModel = model || models[0] || '';

  function handleExecute() {
    if (!prompt.trim()) return;
    executeMutation.mutate(
      { model: selectedModel, prompt: prompt.trim() },
      { onSuccess: (data) => setResult(data) },
    );
  }

  return (
    <div className="panel">
      <h3 className="panel__title">Test Execution</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem', color: 'var(--color-text-muted)' }}>
            Model
          </label>
          <select
            value={selectedModel}
            onChange={(e) => setModel(e.target.value)}
            className="input"
          >
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem', color: 'var(--color-text-muted)' }}>
            Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="input"
            placeholder="Enter a test prompt..."
          />
        </div>

        <button
          onClick={handleExecute}
          disabled={executeMutation.isPending || !prompt.trim()}
          className="button button--primary"
        >
          {executeMutation.isPending ? 'Executing...' : 'Execute'}
        </button>
      </div>

      {executeMutation.isError && (
        <div className="panel__note" style={{ color: 'var(--color-danger)', marginTop: '0.75rem' }}>
          Error: {executeMutation.error instanceof Error ? executeMutation.error.message : 'Execution failed'}
        </div>
      )}

      {result && (
        <div style={{ marginTop: '1rem', borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem' }}>
          <h4 style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>Response</h4>
          <pre style={{
            background: 'var(--color-bg-subtle)',
            padding: '0.75rem',
            borderRadius: '4px',
            fontSize: '0.85rem',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {result.content}
          </pre>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            <span>Model: {result.model}</span>
            {result.inputTokens != null && <span>In: {result.inputTokens} tokens</span>}
            {result.outputTokens != null && <span>Out: {result.outputTokens} tokens</span>}
            <span>Duration: {result.durationMs}ms</span>
          </div>
        </div>
      )}
    </div>
  );
}
