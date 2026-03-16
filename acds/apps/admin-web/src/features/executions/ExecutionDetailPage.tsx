import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import { StatusBadge } from '../../components/common/StatusBadge';
import { DataTable, type ColumnDef } from '../../components/common/DataTable';
import { useExecution } from '../../hooks/useExecutions';
import { formatDate, formatDuration, truncate } from '../../lib/formatters';

interface FallbackRow {
  attempt: number;
  providerId: string;
  status: string;
  latencyMs: number | null;
  errorMessage: string | null;
}

const fallbackColumns: ColumnDef<FallbackRow>[] = [
  { key: 'attempt', header: '#', render: (r) => String(r.attempt) },
  { key: 'providerId', header: 'Provider', render: (r) => truncate(r.providerId, 16) },
  { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  { key: 'latencyMs', header: 'Latency', render: (r) => formatDuration(r.latencyMs) },
  { key: 'error', header: 'Error', render: (r) => truncate(r.errorMessage, 50) },
];

const infoRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '8px 0',
  borderBottom: '1px solid #f3f4f6',
  fontSize: '13px',
};

const labelStyle: React.CSSProperties = { color: '#6b7280' };
const valueStyle: React.CSSProperties = { color: '#111827', fontWeight: 500 };

const panelStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  padding: '20px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
};

export function ExecutionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useExecution(id!);

  if (isLoading) return <p>Loading...</p>;
  if (error || !data) return <p>Execution not found.</p>;

  return (
    <div>
      <PageHeader
        title={`Execution ${truncate(data.id, 16)}`}
        actions={
          <button
            onClick={() => navigate('/executions')}
            style={{
              padding: '8px 16px',
              backgroundColor: '#f3f4f6',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Back
          </button>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <div style={panelStyle}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>Summary</h3>
          <div style={infoRow}>
            <span style={labelStyle}>Status</span>
            <StatusBadge status={data.status} />
          </div>
          <div style={infoRow}>
            <span style={labelStyle}>Application</span>
            <span style={valueStyle}>{data.executionFamily.application}</span>
          </div>
          <div style={infoRow}>
            <span style={labelStyle}>Process</span>
            <span style={valueStyle}>{data.executionFamily.process}</span>
          </div>
          <div style={infoRow}>
            <span style={labelStyle}>Step</span>
            <span style={valueStyle}>{data.executionFamily.step}</span>
          </div>
          <div style={infoRow}>
            <span style={labelStyle}>Latency</span>
            <span style={valueStyle}>{formatDuration(data.latencyMs)}</span>
          </div>
          <div style={infoRow}>
            <span style={labelStyle}>Fallback Attempts</span>
            <span style={valueStyle}>{data.fallbackAttempts}</span>
          </div>
          <div style={infoRow}>
            <span style={labelStyle}>Created</span>
            <span style={valueStyle}>{formatDate(data.createdAt)}</span>
          </div>
          <div style={infoRow}>
            <span style={labelStyle}>Completed</span>
            <span style={valueStyle}>{formatDate(data.completedAt)}</span>
          </div>
        </div>

        <div style={panelStyle}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600 }}>
            Routing Rationale
          </h3>
          <p style={{ fontSize: '13px', color: '#374151', lineHeight: 1.5 }}>
            {data.rationaleSummary || 'No rationale available.'}
          </p>

          <h3 style={{ margin: '24px 0 12px', fontSize: '16px', fontWeight: 600 }}>Result</h3>
          <div style={infoRow}>
            <span style={labelStyle}>Input Tokens</span>
            <span style={valueStyle}>{data.inputTokens ?? '—'}</span>
          </div>
          <div style={infoRow}>
            <span style={labelStyle}>Output Tokens</span>
            <span style={valueStyle}>{data.outputTokens ?? '—'}</span>
          </div>
          <div style={infoRow}>
            <span style={labelStyle}>Cost Estimate</span>
            <span style={valueStyle}>
              {data.costEstimate != null ? `$${data.costEstimate.toFixed(6)}` : '—'}
            </span>
          </div>
          {data.errorMessage && (
            <div style={{ marginTop: '12px', padding: '8px', backgroundColor: '#fef2f2', borderRadius: '4px', fontSize: '13px', color: '#991b1b' }}>
              {data.errorMessage}
            </div>
          )}
        </div>
      </div>

      {data.fallbackHistory && data.fallbackHistory.length > 0 && (
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
            Fallback History
          </h3>
          <DataTable
            columns={fallbackColumns}
            data={data.fallbackHistory}
            keyExtractor={(r) => String(r.attempt)}
            emptyMessage="No fallback history"
          />
        </div>
      )}
    </div>
  );
}
