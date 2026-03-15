import { useState } from 'react';
import {
  usePreviewRollback,
  useExecuteRollback,
} from '../../hooks/useAdaptationRollback';
import type { RollbackPreviewView } from './adaptationRollbackApi';

interface RollbackExecutionPanelProps {
  familyKey: string;
  targetEventId: string;
  onRollbackComplete?: () => void;
}

const panelStyle: React.CSSProperties = {
  padding: '20px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  backgroundColor: '#ffffff',
  marginTop: '24px',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '80px',
  padding: '8px 12px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '13px',
  fontFamily: 'inherit',
  resize: 'vertical',
  boxSizing: 'border-box',
};

const buttonBaseStyle: React.CSSProperties = {
  padding: '8px 20px',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: 600,
  border: 'none',
  cursor: 'pointer',
};

const previewButtonStyle: React.CSSProperties = {
  ...buttonBaseStyle,
  backgroundColor: '#2563eb',
  color: '#ffffff',
};

const executeButtonStyle: React.CSSProperties = {
  ...buttonBaseStyle,
  backgroundColor: '#dc2626',
  color: '#ffffff',
};

const disabledButtonStyle: React.CSSProperties = {
  ...buttonBaseStyle,
  backgroundColor: '#9ca3af',
  color: '#ffffff',
  cursor: 'not-allowed',
};

const cellStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderBottom: '1px solid #e5e7eb',
  fontSize: '12px',
};

const headerCellStyle: React.CSSProperties = {
  ...cellStyle,
  fontWeight: 600,
  color: '#374151',
  backgroundColor: '#f9fafb',
};

function SnapshotTable({ snapshot }: { snapshot: RollbackPreviewView['currentSnapshot'] }) {
  if (snapshot.candidateRankings.length === 0) {
    return <p style={{ color: '#6b7280', fontSize: '13px' }}>No candidates in snapshot.</p>;
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
      <thead>
        <tr>
          <th style={headerCellStyle}>Rank</th>
          <th style={headerCellStyle}>Candidate</th>
          <th style={headerCellStyle}>Score</th>
        </tr>
      </thead>
      <tbody>
        {snapshot.candidateRankings.map((c) => (
          <tr key={c.candidateId}>
            <td style={cellStyle}>{c.rank}</td>
            <td style={{ ...cellStyle, fontFamily: 'monospace' }}>{c.candidateId}</td>
            <td style={cellStyle}>{c.score.toFixed(4)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RollbackExecutionPanel({
  familyKey,
  targetEventId,
  onRollbackComplete,
}: RollbackExecutionPanelProps) {
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<RollbackPreviewView | null>(null);
  const [executed, setExecuted] = useState(false);

  const previewMutation = usePreviewRollback();
  const executeMutation = useExecuteRollback();

  const isProcessing = previewMutation.isPending || executeMutation.isPending;

  async function handlePreview() {
    const result = await previewMutation.mutateAsync({ familyKey, targetEventId });
    setPreview(result);
  }

  async function handleExecute() {
    if (!reason.trim()) {
      return;
    }
    await executeMutation.mutateAsync({ familyKey, targetEventId, reason });
    setExecuted(true);
    onRollbackComplete?.();
  }

  if (executed) {
    return (
      <div style={panelStyle}>
        <h3 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: 600, color: '#065f46' }}>
          Rollback Executed
        </h3>
        <p style={{ color: '#374151', fontSize: '13px', margin: 0 }}>
          The rollback has been executed successfully. The family ranking has been restored.
        </p>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 600, color: '#374151' }}>
        Rollback Controls
      </h3>

      {/* Preview button */}
      {!preview && (
        <button
          type="button"
          style={isProcessing ? disabledButtonStyle : previewButtonStyle}
          onClick={handlePreview}
          disabled={isProcessing}
        >
          {previewMutation.isPending ? 'Loading Preview...' : 'Preview Rollback'}
        </button>
      )}

      {previewMutation.isError && (
        <p style={{ color: '#dc2626', fontSize: '13px', marginTop: '8px' }}>
          Preview failed: {previewMutation.error?.message ?? 'Unknown error'}
        </p>
      )}

      {/* Preview results */}
      {preview && (
        <div style={{ marginTop: '16px' }}>
          {/* Safety status */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '6px',
              marginBottom: '16px',
              backgroundColor: preview.safe ? '#d1fae5' : '#fee2e2',
              color: preview.safe ? '#065f46' : '#991b1b',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            {preview.safe
              ? 'Rollback is safe to execute.'
              : `Rollback has warnings: ${preview.warnings.join('; ')}`}
          </div>

          {/* Current snapshot */}
          <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', margin: '0 0 8px' }}>
            Current Ranking
          </h4>
          <SnapshotTable snapshot={preview.currentSnapshot} />

          {/* Restored snapshot */}
          <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', margin: '0 0 8px' }}>
            Restored Ranking (after rollback)
          </h4>
          <SnapshotTable snapshot={preview.restoredSnapshot} />

          {/* Execute controls */}
          <label
            htmlFor="rollback-reason"
            style={{ display: 'block', fontSize: '13px', color: '#374151', marginBottom: '6px' }}
          >
            Reason (required)
          </label>
          <textarea
            id="rollback-reason"
            style={textareaStyle}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this rollback is necessary..."
            disabled={isProcessing}
          />

          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <button
              type="button"
              style={
                isProcessing || !reason.trim() || !preview.safe
                  ? disabledButtonStyle
                  : executeButtonStyle
              }
              onClick={handleExecute}
              disabled={isProcessing || !reason.trim() || !preview.safe}
            >
              {executeMutation.isPending ? 'Executing...' : 'Execute Rollback'}
            </button>
          </div>

          {executeMutation.isError && (
            <p style={{ color: '#dc2626', fontSize: '13px', marginTop: '8px' }}>
              Execution failed: {executeMutation.error?.message ?? 'Unknown error'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
