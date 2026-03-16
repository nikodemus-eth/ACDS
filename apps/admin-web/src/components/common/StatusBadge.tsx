type StatusColor = 'healthy' | 'degraded' | 'unhealthy' | 'unknown' | string;

const colorMap: Record<string, { bg: string; text: string }> = {
  healthy: { bg: '#dcfce7', text: '#166534' },
  succeeded: { bg: '#dcfce7', text: '#166534' },
  fallback_succeeded: { bg: '#dcfce7', text: '#166534' },
  degraded: { bg: '#fef9c3', text: '#854d0e' },
  pending: { bg: '#fef9c3', text: '#854d0e' },
  running: { bg: '#dbeafe', text: '#1e40af' },
  unhealthy: { bg: '#fecaca', text: '#991b1b' },
  failed: { bg: '#fecaca', text: '#991b1b' },
  fallback_failed: { bg: '#fecaca', text: '#991b1b' },
  unknown: { bg: '#f3f4f6', text: '#374151' },
};

const defaultColor = { bg: '#f3f4f6', text: '#374151' };

interface StatusBadgeProps {
  status: StatusColor;
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const colors = colorMap[status] ?? defaultColor;
  const displayLabel =
    label ??
    status
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <span
      className="status-badge"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {displayLabel}
    </span>
  );
}
