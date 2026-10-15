import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useBodyClass } from '../lib/useApi.js';
import { Flashes, useRouteEffects } from './Layout.jsx';
import Logo from './Logo.jsx';

/** Layout for sign-in, registration, installer and certificate verification pages. */
export default function AuthLayout() {
  const { meta } = useAuth();
  const { pathname } = useLocation();
  useBodyClass('auth-body');
  useRouteEffects();
  const placement = pathname.startsWith('/register') ? 'register' : pathname.startsWith('/login') ? 'login' : null;
  const wide = pathname.startsWith('/register');
  const p = placement ? meta.branding?.placements?.[placement] : null;
  return (
    <main className={`auth ${wide ? 'auth-wide' : ''}`}>
      {placement && p?.enabled ? (
        <div className="auth-brand auth-brand-logo">
          <Logo placement={placement} className="logo-on-dark" />
        </div>
      ) : (
        <div className="auth-brand">
          <div><strong>{meta.appName}</strong><small>{meta.company}</small></div>
        </div>
      )}
      <Flashes />
      <Outlet />
    </main>
  );
}
