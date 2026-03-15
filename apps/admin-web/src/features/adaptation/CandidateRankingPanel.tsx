import { useCandidateRankings } from '../../hooks/useAdaptation';

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

interface CandidateRankingPanelProps {
  familyKey: string;
}

export function CandidateRankingPanel({ familyKey }: CandidateRankingPanelProps) {
  const { data: candidates = [], isLoading } = useCandidateRankings(familyKey);

  // Sort by rollingScore descending to show ranking
  const sorted = [...candidates].sort((a, b) => b.rollingScore - a.rollingScore);

  return (
    <div>
      <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 12px', color: '#111827' }}>
        Candidate Rankings
      </h2>

      {isLoading ? (
        <p>Loading candidates...</p>
      ) : sorted.length === 0 ? (
        <p style={{ color: '#6b7280', fontSize: '13px' }}>No candidates found for this family.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={headerCellStyle}>Rank</th>
              <th style={headerCellStyle}>Candidate ID</th>
              <th style={headerCellStyle}>Score</th>
              <th style={headerCellStyle}>Run Count</th>
              <th style={headerCellStyle}>Success Rate</th>
              <th style={headerCellStyle}>Avg Latency</th>
              <th style={headerCellStyle}>Last Selected</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, index) => (
              <tr
                key={c.candidateId}
                style={index === 0 ? { backgroundColor: '#f0fdf4' } : undefined}
              >
                <td style={cellStyle}>
                  {index + 1}
                  {index === 0 && (
                    <span
                      style={{
                        marginLeft: '6px',
                        padding: '1px 6px',
                        borderRadius: '9999px',
                        fontSize: '11px',
                        fontWeight: 500,
                        backgroundColor: '#d1fae5',
                        color: '#065f46',
                      }}
                    >
                      selected
                    </span>
                  )}
                </td>
                <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: '12px' }}>
                  {c.candidateId}
                </td>
                <td style={cellStyle}>{c.rollingScore.toFixed(4)}</td>
                <td style={cellStyle}>{c.runCount}</td>
                <td style={cellStyle}>{(c.successRate * 100).toFixed(1)}%</td>
                <td style={cellStyle}>{c.averageLatency.toFixed(0)}ms</td>
                <td style={cellStyle}>
                  {c.lastSelectedAt
                    ? new Date(c.lastSelectedAt).toLocaleString()
                    : 'Never'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
