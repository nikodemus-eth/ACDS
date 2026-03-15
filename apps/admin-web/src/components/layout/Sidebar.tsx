import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/providers', label: 'Providers' },
  { to: '/profiles', label: 'Profiles' },
  { to: '/policies', label: 'Policies' },
  { to: '/audit', label: 'Audit' },
  { to: '/executions', label: 'Executions' },
] as const;

const linkStyle: React.CSSProperties = {
  display: 'block',
  padding: '10px 20px',
  textDecoration: 'none',
  color: '#d1d5db',
  fontSize: '14px',
  borderLeft: '3px solid transparent',
};

const activeLinkStyle: React.CSSProperties = {
  ...linkStyle,
  color: '#ffffff',
  backgroundColor: '#374151',
  borderLeftColor: '#3b82f6',
};

export function Sidebar() {
  return (
    <nav
      style={{
        width: '220px',
        backgroundColor: '#1f2937',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        paddingTop: '16px',
      }}
    >
      <div
        style={{
          padding: '0 20px 20px',
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: '#9ca3af',
        }}
      >
        Navigation
      </div>
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          style={({ isActive }) => (isActive ? activeLinkStyle : linkStyle)}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
