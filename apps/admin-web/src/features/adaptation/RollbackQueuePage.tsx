import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import {
  useRollbackCandidates,
  useRollbackHistory,
} from '../../hooks/useAdaptationRollback';

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

const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  fontSize: '13px',
  minWidth: '200px',
};

export function RollbackQueuePage() {
  const [familyFilter, setFamilyFilter] = useState<string>('');
  const filterKey = familyFilter || undefined;

  const { data: candidates = [], isLoading: loadingCandidates } =
    useRollbackCandidates(filterKey);
  const { data: history = [], isLoading: loadingHistory } =
    useRollbackHistory(filterKey);

  return (
    <div>
      <PageHeader
        title="Rollback Management"
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

      {/* Family filter */}
      <div style={{ marginBottom: '20px' }}>
        <input
          style={inputStyle}
          type="text"
          placeholder="Filter by family key..."
          value={familyFilter}
          onChange={(e) => setFamilyFilter(e.target.value)}
        />
      </div>

      {/* Rollback candidates */}
      <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 12px', color: '#111827' }}>
        Rollback Candidates
      </h2>

      {loadingCandidates ? (
        <p>Loading rollback candidates...</p>
      ) : candidates.length === 0 ? (
        <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '24px' }}>
          No rollback candidates available.
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '32px' }}>
          <caption className="sr-only">Rollback candidates</caption>
          <thead>
            <tr>
              <th scope="col" style={headerCellStyle}>Family Key</th>
              <th scope="col" style={headerCellStyle}>Event ID</th>
              <th scope="col" style={headerCellStyle}>Trigger</th>
              <th scope="col" style={headerCellStyle}>Candidates</th>
              <th scope="col" style={headerCellStyle}>Event Date</th>
              <th scope="col" style={headerCellStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={`${c.familyKey}-${c.targetAdaptationEventId}`}>
                <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: '12px' }}>
                  {c.familyKey}
                </td>
                <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: '12px' }}>
                  {c.targetAdaptationEventId.slice(0, 8)}...
                </td>
                <td style={cellStyle}>{c.trigger}</td>
                <td style={cellStyle}>{c.candidateCount}</td>
                <td style={cellStyle}>{new Date(c.eventCreatedAt).toLocaleString()}</td>
                <td style={cellStyle}>
                  <Link
                    to={`/adaptation/rollbacks/${encodeURIComponent(c.familyKey)}?eventId=${encodeURIComponent(c.targetAdaptationEventId)}`}
                    style={{ color: '#2563eb', textDecoration: 'none', fontSize: '13px' }}
                    aria-label={`Review rollback for ${c.familyKey}`}
                  >
                    Review
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Rollback history */}
      <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 12px', color: '#111827' }}>
        Recent Rollback History
      </h2>

      {loadingHistory ? (
        <p>Loading rollback history...</p>
      ) : history.length === 0 ? (
        <p style={{ color: '#6b7280', fontSize: '13px' }}>No rollback history available.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <caption className="sr-only">Recent rollback history</caption>
          <thead>
            <tr>
              <th scope="col" style={headerCellStyle}>Family Key</th>
              <th scope="col" style={headerCellStyle}>Target Event</th>
              <th scope="col" style={headerCellStyle}>Actor</th>
              <th scope="col" style={headerCellStyle}>Reason</th>
              <th scope="col" style={headerCellStyle}>Rolled Back At</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: '12px' }}>
                  {h.familyKey}
                </td>
                <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: '12px' }}>
                  {h.targetAdaptationEventId.slice(0, 8)}...
                </td>
                <td style={cellStyle}>{h.actor}</td>
                <td style={{ ...cellStyle, maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {h.reason}
                </td>
                <td style={cellStyle}>{new Date(h.rolledBackAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
