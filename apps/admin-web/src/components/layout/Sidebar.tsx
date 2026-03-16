import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/providers', label: 'Providers' },
  { to: '/profiles', label: 'Profiles' },
  { to: '/policies', label: 'Policies' },
  { to: '/adaptation', label: 'Adaptation' },
  { to: '/audit', label: 'Audit' },
  { to: '/executions', label: 'Executions' },
] as const;

export function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__eyebrow">Governed Runtime</span>
        <strong>ACDS Control</strong>
        <p>Dispatch, policy, and adaptive health in one place.</p>
      </div>
      <div className="sidebar__section-label">Navigation</div>
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            isActive ? 'sidebar__link sidebar__link--active' : 'sidebar__link'
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
