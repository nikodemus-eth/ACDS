import { useParams, Link } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import { useFamilyDetail } from '../../hooks/useAdaptation';
import { CandidateRankingPanel } from './CandidateRankingPanel';

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
  fontSize: '20px',
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

export function FamilyPerformancePage() {
  const { familyKey } = useParams<{ familyKey: string }>();
  const decodedKey = decodeURIComponent(familyKey ?? '');
  const { data: family, isLoading } = useFamilyDetail(decodedKey);

  if (isLoading) {
    return <p>Loading family detail...</p>;
  }

  if (!family) {
    return (
      <div>
        <PageHeader title="Family Not Found" />
        <p style={{ color: '#6b7280' }}>
          No performance data found for family "{decodedKey}".
        </p>
        <Link to="/adaptation" style={{ color: '#2563eb' }}>
          Back to Adaptation
        </Link>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={family.familyKey}
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
            Back
          </Link>
        }
      />

      {/* Summary Stats */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <div style={statCardStyle}>
          <div style={labelStyle}>Rolling Score</div>
          <div style={valueStyle}>{family.rollingScore.toFixed(4)}</div>
        </div>
        <div style={statCardStyle}>
          <div style={labelStyle}>Trend</div>
          <div style={valueStyle}>{family.trend.replace('_', ' ')}</div>
        </div>
        <div style={statCardStyle}>
          <div style={labelStyle}>Run Count</div>
          <div style={valueStyle}>{family.runCount}</div>
        </div>
        <div style={statCardStyle}>
          <div style={labelStyle}>Recent Failures</div>
          <div style={valueStyle}>{family.recentFailures}</div>
        </div>
        <div style={statCardStyle}>
          <div style={labelStyle}>Last Updated</div>
          <div style={{ ...valueStyle, fontSize: '14px' }}>
            {new Date(family.lastUpdated).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Metric Trends */}
      <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 12px', color: '#111827' }}>
        Metric Trends
      </h2>
      {family.metricTrends.length === 0 ? (
        <p style={{ color: '#6b7280', fontSize: '13px' }}>No metric trend data available.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
          <thead>
            <tr>
              <th style={headerCellStyle}>Metric</th>
              <th style={headerCellStyle}>Mean</th>
              <th style={headerCellStyle}>Latest</th>
            </tr>
          </thead>
          <tbody>
            {family.metricTrends.map((t) => (
              <tr key={t.label}>
                <td style={cellStyle}>{t.label}</td>
                <td style={cellStyle}>{t.mean.toFixed(4)}</td>
                <td style={cellStyle}>{t.latest.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Candidate Rankings */}
      <CandidateRankingPanel familyKey={decodedKey} />
    </div>
  );
}
