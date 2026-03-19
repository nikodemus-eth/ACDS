import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  return (
    <div className="app-shell">
      <a href="#app-main" className="skip-link">Skip to main content</a>
      <div className="app-shell__glow app-shell__glow--one" aria-hidden="true" />
      <div className="app-shell__glow app-shell__glow--two" aria-hidden="true" />
      <Sidebar />
      <div className="app-shell__content">
        <Topbar />
        <main id="app-main" className="app-shell__main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
