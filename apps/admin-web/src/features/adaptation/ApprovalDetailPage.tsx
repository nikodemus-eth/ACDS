import { useParams, Link } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import { useApprovalDetail } from '../../hooks/useAdaptationApprovals';
import { ApprovalDecisionPanel } from './ApprovalDecisionPanel';

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

const cellStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid #e5e7eb',
  fontSize: '13px',
};

const headerCellStyle: React.CSSProperties = {
  ...cellStyle,
  fontWeight: 600,
  color: '#374151',
  backgroundColor: '#f9fafb',
};

function statusColor(status: string): string {
  const map: Record<string, string> = {
    pending: '#92400e',
    approved: '#065f46',
    rejected: '#991b1b',
    expired: '#6b7280',
    superseded: '#3730a3',
  };
  return map[status] ?? '#374151';
}

export function ApprovalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const decodedId = decodeURIComponent(id ?? '');
  const { data: approval, isLoading, refetch } = useApprovalDetail(decodedId);

  if (isLoading) {
    return <p>Loading approval detail...</p>;
  }

  if (!approval) {
    return (
      <div>
        <PageHeader title="Approval Not Found" />
        <p style={{ color: '#6b7280' }}>No approval found with ID "{decodedId}".</p>
        <Link to="/adaptation/approvals" style={{ color: '#2563eb' }}>
          Back to Approval Queue
        </Link>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Approval Detail"
        actions={
          <Link
            to="/adaptation/approvals"
            style={{
              padding: '6px 14px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#374151',
              textDecoration: 'none',
            }}
          >
            Back to Queue
          </Link>
        }
      />

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <div style={statCardStyle}>
          <div style={labelStyle}>Family Key</div>
          <div style={{ ...valueStyle, fontFamily: 'monospace', fontSize: '13px' }}>
            {approval.familyKey}
          </div>
        </div>
        <div style={statCardStyle}>
          <div style={labelStyle}>Status</div>
          <div style={{ ...valueStyle, color: statusColor(approval.status) }}>
            {approval.status}
          </div>
        </div>
        <div style={statCardStyle}>
          <div style={labelStyle}>Adaptive Mode</div>
          <div style={valueStyle}>{approval.adaptiveMode.replace(/_/g, ' ')}</div>
        </div>
        <div style={statCardStyle}>
          <div style={labelStyle}>Submitted</div>
          <div style={{ ...valueStyle, fontSize: '13px' }}>
            {new Date(approval.submittedAt).toLocaleString()}
          </div>
        </div>
        <div style={statCardStyle}>
          <div style={labelStyle}>Expires</div>
          <div style={{ ...valueStyle, fontSize: '13px' }}>
            {new Date(approval.expiresAt).toLocaleString()}
          </div>
        </div>
        {approval.decidedBy && (
          <div style={statCardStyle}>
            <div style={labelStyle}>Decided By</div>
            <div style={valueStyle}>{approval.decidedBy}</div>
          </div>
        )}
      </div>

      {/* Evidence summary */}
      <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 8px', color: '#111827' }}>
        Evidence Summary
      </h2>
      <div
        style={{
          padding: '14px',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          backgroundColor: '#f9fafb',
          fontSize: '13px',
          color: '#374151',
          lineHeight: 1.6,
          marginBottom: '24px',
        }}
      >
        {approval.evidence}
      </div>

      {approval.reason && (
        <>
          <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 8px', color: '#111827' }}>
            Decision Reason
          </h2>
          <div
            style={{
              padding: '14px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              backgroundColor: '#f9fafb',
              fontSize: '13px',
              color: '#374151',
              lineHeight: 1.6,
              marginBottom: '24px',
            }}
          >
            {approval.reason}
          </div>
        </>
      )}

      {/* Previous ranking */}
      <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 12px', color: '#111827' }}>
        Previous Ranking
      </h2>
      {approval.previousRanking.length === 0 ? (
        <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '24px' }}>
          No previous ranking data.
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
          <thead>
            <tr>
              <th style={headerCellStyle}>Rank</th>
              <th style={headerCellStyle}>Candidate ID</th>
              <th style={headerCellStyle}>Score</th>
            </tr>
          </thead>
          <tbody>
            {approval.previousRanking.map((c) => (
              <tr key={c.candidateId}>
                <td style={cellStyle}>{c.rank}</td>
                <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: '12px' }}>
                  {c.candidateId}
                </td>
                <td style={cellStyle}>{c.score.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Proposed ranking */}
      <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 12px', color: '#111827' }}>
        Proposed Ranking
      </h2>
      {approval.proposedRanking.length === 0 ? (
        <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '24px' }}>
          No proposed ranking data.
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
          <thead>
            <tr>
              <th style={headerCellStyle}>Rank</th>
              <th style={headerCellStyle}>Candidate ID</th>
              <th style={headerCellStyle}>Score</th>
            </tr>
          </thead>
          <tbody>
            {approval.proposedRanking.map((c, index) => (
              <tr
                key={c.candidateId}
                style={index === 0 ? { backgroundColor: '#f0fdf4' } : undefined}
              >
                <td style={cellStyle}>{c.rank}</td>
                <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: '12px' }}>
                  {c.candidateId}
                </td>
                <td style={cellStyle}>{c.score.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Decision panel */}
      <ApprovalDecisionPanel
        approvalId={approval.id}
        status={approval.status}
        onDecisionComplete={() => refetch()}
      />
    </div>
  );
}
