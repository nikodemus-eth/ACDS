import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const navItems = [
  { to: '/providers', label: 'Providers' },
  { to: '/profiles', label: 'Profiles' },
  { to: '/policies', label: 'Policies' },
  { to: '/adaptation', label: 'Adaptation' },
  { to: '/audit', label: 'Audit' },
  { to: '/executions', label: 'Executions' },
  { to: '/apple-intelligence', label: 'Apple Intelligence' },
] as const;

export function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  // Close sidebar on navigation
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Close on Escape
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) setIsOpen(false);
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  return (
    <>
      <button
        className="sidebar__toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="sidebar-nav"
        aria-label={isOpen ? 'Close navigation' : 'Open navigation'}
      >
        {isOpen ? '\u2715' : '\u2630'}
      </button>
      {isOpen && (
        <div
          className="sidebar__overlay sidebar__overlay--visible"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}
      <nav
        id="sidebar-nav"
        className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}
        aria-label="Main navigation"
      >
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
    </>
  );
}
