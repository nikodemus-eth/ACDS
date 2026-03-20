import { StatusBadge } from '../common/StatusBadge';

export function Topbar() {
  return (
    <header className="topbar" role="banner">
      <div className="topbar__title-group">
        <span className="topbar__title">ACDS Admin</span>
        <span className="topbar__subtitle">Adaptive Cognitive Dispatch System</span>
      </div>
      <div className="topbar__status">
        <span className="topbar__label">System</span>
        <StatusBadge status="healthy" />
      </div>
    </header>
  );
}
