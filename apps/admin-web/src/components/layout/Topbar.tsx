import { StatusBadge } from '../common/StatusBadge';

export function Topbar() {
  return (
    <header
      style={{
        height: '56px',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
      }}
    >
      <span style={{ fontSize: '18px', fontWeight: 600, color: '#111827' }}>
        ACDS Admin
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '13px', color: '#6b7280' }}>System</span>
        <StatusBadge status="healthy" />
      </div>
    </header>
  );
}
