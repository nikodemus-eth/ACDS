import { useState } from 'react';
import type { BridgeCapabilities, ExecuteResponse } from './appleIntelligenceApi';

const BRIDGE_URL = 'http://localhost:11435';

interface TestExecutionPanelProps {
  capabilities: BridgeCapabilities | undefined;
}

export function TestExecutionPanel({ capabilities }: TestExecutionPanelProps) {
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<ExecuteResponse | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const models = capabilities?.models ?? [];
  const selectedModel = model || models[0] || '';

  async function handleExecute() {
    if (!prompt.trim()) return;
    setIsPending(true);
    setError(null);
    try {
      const response = await fetch(`${BRIDGE_URL}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel, prompt: prompt.trim() }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `Bridge returned ${response.status}`);
      }
      const data: ExecuteResponse = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="panel">
      <h3 className="panel__title">Test Execution</h3>
      <div className="panel__note" style={{ marginBottom: '0.75rem' }}>
        Calls the bridge directly at {BRIDGE_URL}
      </div>

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
          onClick={() => void handleExecute()}
          disabled={isPending || !prompt.trim()}
          className="button button--primary"
        >
          {isPending ? 'Executing...' : 'Execute'}
        </button>
      </div>

      {error && (
        <div className="panel__note" style={{ color: 'var(--color-danger)', marginTop: '0.75rem' }}>
          Error: {error}
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
