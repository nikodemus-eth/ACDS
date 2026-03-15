import { useParams, useSearchParams, Link } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import { useFamilyDetail } from '../../hooks/useAdaptation';
import { RollbackExecutionPanel } from './RollbackExecutionPanel';

const statCardStyle: React.CSSProperties = {
  padding: '16px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  backgroundColor: '#ffffff',
  minWidth: '140px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#6b7280',
  marginBottom: '4px',
};

const valueStyle: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: 600,
  color: '#111827',
};

export function RollbackDetailPage() {
  const { familyKey } = useParams<{ familyKey: string }>();
  const [searchParams] = useSearchParams();
  const decodedKey = decodeURIComponent(familyKey ?? '');
  const targetEventId = searchParams.get('eventId') ?? '';

  const { data: family, isLoading: loadingFamily } = useFamilyDetail(decodedKey);

  if (loadingFamily) {
    return <p>Loading family detail...</p>;
  }

  if (!decodedKey) {
    return (
      <div>
        <PageHeader title="Rollback" />
        <p style={{ color: '#6b7280' }}>No family key specified.</p>
        <Link to="/adaptation/rollbacks" style={{ color: '#2563eb' }}>
          Back to Rollbacks
        </Link>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Rollback Detail"
        actions={
          <Link
            to="/adaptation/rollbacks"
            style={{
              padding: '6px 14px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#374151',
              textDecoration: 'none',
            }}
          >
            Back to Rollbacks
          </Link>
        }
      />

      {/* Family summary */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <div style={statCardStyle}>
          <div style={labelStyle}>Family Key</div>
          <div style={{ ...valueStyle, fontFamily: 'monospace', fontSize: '13px' }}>
            {decodedKey}
          </div>
        </div>
        <div style={statCardStyle}>
          <div style={labelStyle}>Target Event ID</div>
          <div style={{ ...valueStyle, fontFamily: 'monospace', fontSize: '13px' }}>
            {targetEventId ? `${targetEventId.slice(0, 12)}...` : 'Not specified'}
          </div>
        </div>
        {family && (
          <>
            <div style={statCardStyle}>
              <div style={labelStyle}>Rolling Score</div>
              <div style={valueStyle}>{family.rollingScore.toFixed(4)}</div>
            </div>
            <div style={statCardStyle}>
              <div style={labelStyle}>Trend</div>
              <div style={valueStyle}>{family.trend.replace('_', ' ')}</div>
            </div>
            <div style={statCardStyle}>
              <div style={labelStyle}>Recent Failures</div>
              <div style={valueStyle}>{family.recentFailures}</div>
            </div>
          </>
        )}
      </div>

      {/* Rollback execution panel */}
      {targetEventId ? (
        <RollbackExecutionPanel
          familyKey={decodedKey}
          targetEventId={targetEventId}
          onRollbackComplete={() => {
            // Optionally navigate back or refresh
          }}
        />
      ) : (
        <div
          style={{
            padding: '20px',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            backgroundColor: '#f9fafb',
          }}
        >
          <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>
            No target event ID specified. Select a rollback candidate from the{' '}
            <Link to="/adaptation/rollbacks" style={{ color: '#2563eb' }}>
              rollback queue
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
