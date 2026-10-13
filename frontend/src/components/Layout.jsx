import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useAuth, hasRole } from '../lib/auth.jsx';
import { useFlash } from '../lib/flash.jsx';
import { initials, ROLES } from '../lib/format.js';

export function Flashes() {
  const { items, dismiss } = useFlash();
  return items.map((f) => (
    <div key={f.id} className={`flash flash-${f.type}`} role="status">
      {f.message}
      <button type="button" className="flash-close" aria-label="Dismiss" onClick={() => dismiss(f.id)}>
        <Icon name="x" />
      </button>
    </div>
  ));
}

/** Clears old flash messages and closes the mobile menu on every page change. */
export function useRouteEffects(setNavOpen) {
  const { pathname, search } = useLocation();
  const { age } = useFlash();
  useEffect(() => {
    age();
    setNavOpen?.(false);
    window.scrollTo(0, 0);
  }, [pathname, search]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Signed-in layout: sidebar navigation + content. */
export default function Layout() {
  const { user, meta, signOut } = useAuth();
  const { flash } = useFlash();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  useRouteEffects(setNavOpen);

  useEffect(() => {
    document.body.classList.toggle('nav-open', navOpen);
    return () => document.body.classList.remove('nav-open');
  }, [navOpen]);

  const learnActive = ['/courses', '/lessons', '/quizzes', '/attempts'].some((p) => pathname.startsWith(p));
  const logout = () => {
    signOut();
    flash('info', 'You have signed out.');
    navigate('/login');
  };

  return (
    <>
      <div className="shell">
        <aside className="sidebar" id="sidebar">
          <Link className="brand" to="/">
            <span className="brand-mark">S</span>
            <span className="brand-text"><strong>{meta.appName}</strong><small>{meta.company}</small></span>
          </Link>
          <nav className="nav">
            <p className="nav-label">Learn</p>
            <NavLink to="/" end><Icon name="home" />Dashboard</NavLink>
            <Link to="/courses" aria-current={learnActive ? 'page' : undefined}><Icon name="book" />Courses</Link>
            <NavLink to="/certificates"><Icon name="award" />Certificates</NavLink>
            {hasRole(user, 'admin', 'trainer', 'team_lead') && (
              <>
                <p className="nav-label">Track</p>
                <NavLink to="/reports"><Icon name="chart" />Reports</NavLink>
              </>
            )}
            {hasRole(user, 'admin', 'trainer') && (
              <>
                <p className="nav-label">Build</p>
                <Link to="/manage/courses" aria-current={pathname.startsWith('/manage') ? 'page' : undefined}>
                  <Icon name="edit" />Manage courses
                </Link>
              </>
            )}
            {hasRole(user, 'admin') && (
              <>
                <p className="nav-label">Organisation</p>
                <NavLink to="/admin/users"><Icon name="users" />People</NavLink>
                <NavLink to="/admin/teams"><Icon name="team" />Teams</NavLink>
              </>
            )}
          </nav>
          <div className="me">
            <span className="avatar">{initials(user.name)}</span>
            <span className="me-text">
              <strong>{user.name}</strong>
              <small>{ROLES[user.role] || user.role}{user.teamName ? ` · ${user.teamName}` : ''}</small>
            </span>
            <div className="me-actions">
              <Link to="/account/password" className="icon-btn" title="Change password" aria-label="Change password"><Icon name="key" /></Link>
              <button type="button" className="icon-btn" onClick={logout} title="Sign out" aria-label="Sign out"><Icon name="logout" /></button>
            </div>
          </div>
        </aside>
        <div className="main">
          <header className="topbar">
            <button className="icon-btn" type="button" onClick={() => setNavOpen((o) => !o)} aria-label="Open menu" aria-controls="sidebar">
              <Icon name="menu" />
            </button>
            <Link className="brand brand-small" to="/"><span className="brand-mark">S</span><strong>{meta.appName}</strong></Link>
          </header>
          <main className="content">
            <Flashes />
            <Outlet />
          </main>
        </div>
      </div>
      <div className="scrim" onClick={() => setNavOpen(false)} />
    </>
  );
}
