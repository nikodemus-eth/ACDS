import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import { useApprovalList } from '../../hooks/useAdaptationApprovals';

const cellStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderBottom: '1px solid #e5e7eb',
  fontSize: '13px',
};

const headerCellStyle: React.CSSProperties = {
  ...cellStyle,
  fontWeight: 600,
  color: '#374151',
  backgroundColor: '#f9fafb',
};

const selectStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '13px',
  backgroundColor: '#ffffff',
};

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '13px',
  minWidth: '200px',
};

function statusBadge(status: string): React.ReactNode {
  const colors: Record<string, { bg: string; text: string }> = {
    pending: { bg: '#fef3c7', text: '#92400e' },
    approved: { bg: '#d1fae5', text: '#065f46' },
    rejected: { bg: '#fee2e2', text: '#991b1b' },
    expired: { bg: '#f3f4f6', text: '#6b7280' },
    superseded: { bg: '#e0e7ff', text: '#3730a3' },
  };
  const c = colors[status] ?? colors.expired;
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: '9999px',
        fontSize: '12px',
        fontWeight: 500,
        backgroundColor: c.bg,
        color: c.text,
      }}
    >
      {status}
    </span>
  );
}

export function ApprovalQueuePage() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [familyFilter, setFamilyFilter] = useState<string>('');

  const filters = {
    status: statusFilter || undefined,
    familyKey: familyFilter || undefined,
  };

  const { data: approvals = [], isLoading } = useApprovalList(filters);

  return (
    <div>
      <PageHeader
        title="Approval Queue"
        actions={
          <Link
            to="/adaptation"
            style={{
              padding: '6px 14px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#374151',
              textDecoration: 'none',
            }}
          >
            Back to Adaptation
          </Link>
        }
      />

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <select
          style={selectStyle}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="expired">Expired</option>
          <option value="superseded">Superseded</option>
        </select>

        <input
          style={inputStyle}
          type="text"
          placeholder="Filter by family key..."
          value={familyFilter}
          onChange={(e) => setFamilyFilter(e.target.value)}
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <p>Loading approvals...</p>
      ) : approvals.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No approvals match the current filters.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={headerCellStyle}>Family Key</th>
              <th style={headerCellStyle}>Status</th>
              <th style={headerCellStyle}>Mode</th>
              <th style={headerCellStyle}>Rankings</th>
              <th style={headerCellStyle}>Submitted</th>
              <th style={headerCellStyle}>Expires</th>
              <th style={headerCellStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {approvals.map((a) => (
              <tr key={a.id}>
                <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: '12px' }}>
                  {a.familyKey}
                </td>
                <td style={cellStyle}>{statusBadge(a.status)}</td>
                <td style={cellStyle}>{a.adaptiveMode.replace(/_/g, ' ')}</td>
                <td style={cellStyle}>
                  {a.currentRankingCount} &rarr; {a.proposedRankingCount}
                </td>
                <td style={cellStyle}>{new Date(a.submittedAt).toLocaleString()}</td>
                <td style={cellStyle}>{new Date(a.expiresAt).toLocaleString()}</td>
                <td style={cellStyle}>
                  <Link
                    to={`/adaptation/approvals/${encodeURIComponent(a.id)}`}
                    style={{ color: '#2563eb', textDecoration: 'none', fontSize: '13px' }}
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
