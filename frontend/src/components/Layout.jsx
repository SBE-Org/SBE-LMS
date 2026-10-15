import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import Logo from './Logo.jsx';
import NotificationBell from './Notifications.jsx';
import {
  useAuth, hasRole, canBuild, canSeeReports, canSeeRegistrations, canAuthorizeCertificates, isStudent,
} from '../lib/auth.jsx';
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
            <Logo placement="header" compact />
          </Link>
          <nav className="nav">
            <p className="nav-label">Learn</p>
            <NavLink to="/" end><Icon name="home" />Dashboard</NavLink>
            {isStudent(user) && <NavLink to="/registration"><Icon name="clipboard" />My registration</NavLink>}
            <Link to="/courses" aria-current={learnActive ? 'page' : undefined}><Icon name="book" />Courses</Link>
            <NavLink to="/certificates" end><Icon name="award" />Certificates</NavLink>
            {canSeeRegistrations(user) && (
              <>
                <p className="nav-label">Admissions</p>
                <NavLink to="/registrations" end={false}><Icon name="clipboard" />{hasRole(user, 'department_head') ? 'Applications' : 'Student registrations'}</NavLink>
                {hasRole(user, 'admin', 'registrar') && <NavLink to="/registrations/new"><Icon name="user-plus" />Register a student</NavLink>}
              </>
            )}
            {canSeeReports(user) && (
              <>
                <p className="nav-label">Track</p>
                <NavLink to="/reports"><Icon name="chart" />Reports</NavLink>
              </>
            )}
            {(canBuild(user) || canAuthorizeCertificates(user)) && (
              <>
                <p className="nav-label">Build</p>
                {canBuild(user) && (
                  <Link to="/manage/courses" aria-current={pathname.startsWith('/manage/courses') || pathname.startsWith('/manage/modules') || pathname.startsWith('/manage/lessons') || pathname.startsWith('/manage/quizzes') || pathname.startsWith('/manage/questions') ? 'page' : undefined}>
                    <Icon name="edit" />Manage courses
                  </Link>
                )}
                {canAuthorizeCertificates(user) && <NavLink to="/manage/certificates"><Icon name="award" />Certificate approvals</NavLink>}
              </>
            )}
            {hasRole(user, 'admin') && (
              <>
                <p className="nav-label">Organisation</p>
                <NavLink to="/admin/users"><Icon name="users" />People</NavLink>
                <NavLink to="/admin/departments"><Icon name="building" />Departments</NavLink>
                <NavLink to="/admin/teams"><Icon name="team" />Teams</NavLink>
                <NavLink to="/admin/settings"><Icon name="settings" />Branding & settings</NavLink>
                <NavLink to="/admin/audit"><Icon name="history" />Audit log</NavLink>
              </>
            )}
          </nav>
          <div className="me">
            <span className="avatar">{initials(user.name)}</span>
            <span className="me-text">
              <strong>{user.name}</strong>
              <small>{ROLES[user.role] || user.role}{user.departmentName ? ` · ${user.departmentName}` : user.teamName ? ` · ${user.teamName}` : ''}</small>
            </span>
            <div className="me-actions">
              <NotificationBell />
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
            <Link className="brand brand-small" to="/"><Logo placement="header" compact showName={false} size="small" nameFallback={false} /><strong>{meta.appName}</strong></Link>
            <NotificationBell />
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
