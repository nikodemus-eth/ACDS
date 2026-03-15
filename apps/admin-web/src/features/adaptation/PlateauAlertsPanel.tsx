import { Link } from 'react-router-dom';
import type { FamilyPerformanceView } from './adaptationApi';

interface PlateauAlertsPanelProps {
  families: FamilyPerformanceView[];
}

function severityBadge(trend: string, recentFailures: number, runCount: number) {
  const failureRate = runCount > 0 ? recentFailures / runCount : 0;

  let severity: 'severe' | 'moderate' | 'mild';
  if (trend === 'declining' && failureRate > 0.3) {
    severity = 'severe';
  } else if (trend === 'declining' || failureRate > 0.2) {
    severity = 'moderate';
  } else {
    severity = 'mild';
  }

  const colors: Record<string, { bg: string; text: string }> = {
    severe: { bg: '#fee2e2', text: '#991b1b' },
    moderate: { bg: '#fef3c7', text: '#92400e' },
    mild: { bg: '#fef9c3', text: '#854d0e' },
  };
  const c = colors[severity];

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
      {severity}
    </span>
  );
}

export function PlateauAlertsPanel({ families }: PlateauAlertsPanelProps) {
  // Filter families that show plateau indicators: declining trend or high failure rate
  const alertFamilies = families.filter((f) => {
    if (f.trend === 'declining') return true;
    if (f.runCount > 0 && f.recentFailures / f.runCount > 0.2) return true;
    return false;
  });

  if (alertFamilies.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        border: '1px solid #fde68a',
        borderRadius: '8px',
        backgroundColor: '#fffbeb',
        padding: '16px',
        marginBottom: '20px',
      }}
    >
      <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#92400e', margin: '0 0 12px' }}>
        Plateau Alerts ({alertFamilies.length})
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {alertFamilies.map((f) => (
          <div
            key={f.familyKey}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '8px 12px',
              backgroundColor: '#ffffff',
              borderRadius: '6px',
              border: '1px solid #fde68a',
            }}
          >
            <Link
              to={`/adaptation/${encodeURIComponent(f.familyKey)}`}
              style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500, fontSize: '13px' }}
            >
              {f.familyKey}
            </Link>

            {severityBadge(f.trend, f.recentFailures, f.runCount)}

            <span style={{ fontSize: '12px', color: '#6b7280' }}>
              Score: {f.rollingScore.toFixed(4)} | Failures: {f.recentFailures}/{f.runCount}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
