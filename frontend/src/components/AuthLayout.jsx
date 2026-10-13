import { Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useBodyClass } from '../lib/useApi.js';
import { Flashes, useRouteEffects } from './Layout.jsx';

/** Layout for sign-in, installer and certificate verification pages. */
export default function AuthLayout() {
  const { meta } = useAuth();
  useBodyClass('auth-body');
  useRouteEffects();
  return (
    <main className="auth">
      <div className="auth-brand">
        <span className="brand-mark brand-mark-lg">S</span>
        <div><strong>{meta.appName}</strong><small>{meta.company}</small></div>
      </div>
      <Flashes />
      <Outlet />
    </main>
  );
}
