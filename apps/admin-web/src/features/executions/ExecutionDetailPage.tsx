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

      <div className="details-grid">
        <div className="panel">
          <h3 className="panel__title">Summary</h3>
          <dl className="dl-grid">
            <dt className="dl-grid__term">Status</dt>
            <dd className="dl-grid__value"><StatusBadge status={data.status} /></dd>
            <dt className="dl-grid__term">Application</dt>
            <dd className="dl-grid__value">{data.executionFamily.application}</dd>
            <dt className="dl-grid__term">Process</dt>
            <dd className="dl-grid__value">{data.executionFamily.process}</dd>
            <dt className="dl-grid__term">Step</dt>
            <dd className="dl-grid__value">{data.executionFamily.step}</dd>
            <dt className="dl-grid__term">Latency</dt>
            <dd className="dl-grid__value">{formatDuration(data.latencyMs)}</dd>
            <dt className="dl-grid__term">Fallback Attempts</dt>
            <dd className="dl-grid__value">{data.fallbackAttempts}</dd>
            <dt className="dl-grid__term">Created</dt>
            <dd className="dl-grid__value">{formatDate(data.createdAt)}</dd>
            <dt className="dl-grid__term">Completed</dt>
            <dd className="dl-grid__value">{formatDate(data.completedAt)}</dd>
          </dl>
        </div>

        <div className="panel">
          <h3 className="panel__title">Routing Rationale</h3>
          <p style={{ fontSize: '13px', color: '#374151', lineHeight: 1.5 }}>
            {data.rationaleSummary || 'No rationale available.'}
          </p>

          <h3 className="panel__title" style={{ marginTop: '24px' }}>Result</h3>
          <dl className="dl-grid">
            <dt className="dl-grid__term">Input Tokens</dt>
            <dd className="dl-grid__value">{data.inputTokens ?? '—'}</dd>
            <dt className="dl-grid__term">Output Tokens</dt>
            <dd className="dl-grid__value">{data.outputTokens ?? '—'}</dd>
            <dt className="dl-grid__term">Cost Estimate</dt>
            <dd className="dl-grid__value">
              {data.costEstimate != null ? `$${data.costEstimate.toFixed(6)}` : '—'}
            </dd>
          </dl>
          {data.errorMessage && (
            <div role="alert" style={{ marginTop: '12px', padding: '8px', backgroundColor: '#fef2f2', borderRadius: '4px', fontSize: '13px', color: 'var(--danger)' }}>
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
