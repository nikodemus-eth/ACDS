import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import { useFamilyPerformanceList } from '../../hooks/useAdaptation';
import { PlateauAlertsPanel } from './PlateauAlertsPanel';

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

function trendBadge(trend: string): React.ReactNode {
  const colors: Record<string, { bg: string; text: string }> = {
    improving: { bg: '#d1fae5', text: '#065f46' },
    stable: { bg: '#dbeafe', text: '#1e40af' },
    declining: { bg: '#fee2e2', text: '#991b1b' },
    insufficient_data: { bg: '#f3f4f6', text: '#6b7280' },
  };
  const c = colors[trend] ?? colors.insufficient_data;
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
      {trend.replace('_', ' ')}
    </span>
  );
}

export function AdaptationPage() {
  const { data: families = [], isLoading } = useFamilyPerformanceList();

  return (
    <div>
      <PageHeader title="Adaptive Optimization" />

      <PlateauAlertsPanel families={families} />

      <h2 className="section-title">Family Performance</h2>

      {isLoading ? (
        <p className="empty-state">Loading family performance data...</p>
      ) : families.length === 0 ? (
        <p className="empty-state">No family performance data available.</p>
      ) : (
        <table className="data-table data-table--plain">
          <thead>
            <tr>
              <th style={headerCellStyle}>Family Key</th>
              <th style={headerCellStyle}>Rolling Score</th>
              <th style={headerCellStyle}>Trend</th>
              <th style={headerCellStyle}>Run Count</th>
              <th style={headerCellStyle}>Recent Failures</th>
              <th style={headerCellStyle}>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {families.map((f) => (
              <tr key={f.familyKey}>
                <td style={cellStyle}>
                  <Link
                    to={`/adaptation/${encodeURIComponent(f.familyKey)}`}
                    style={{ color: '#2563eb', textDecoration: 'none' }}
                  >
                    {f.familyKey}
                  </Link>
                </td>
                <td style={cellStyle}>{f.rollingScore.toFixed(4)}</td>
                <td style={cellStyle}>{trendBadge(f.trend)}</td>
                <td style={cellStyle}>{f.runCount}</td>
                <td style={cellStyle}>{f.recentFailures}</td>
                <td style={cellStyle}>{new Date(f.lastUpdated).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
