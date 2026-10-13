import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useTitle } from '../lib/useApi.js';

export default function Login() {
  const { signIn, meta } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useTitle('Sign in', meta.appName);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token, user } = await api.post('/auth/login', { email, password });
      signIn(token, user);
      const from = location.state?.from;
      navigate(user.mustChangePassword ? '/account/password' : from && from.startsWith('/') && !from.startsWith('//') ? from : '/', { replace: true });
    } catch (err) {
      setError(err.message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <form onSubmit={submit} className="card auth-card">
        <h1>Sign in</h1>
        <p className="muted">Use the work email and password your administrator gave you.</p>
        {error && <div className="flash flash-error" role="alert">{error}</div>}
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted small center">Forgot your password? Ask your team lead or administrator to reset it.</p>
      </form>
      <p className="center small"><Link to="/verify">Verify a certificate</Link></p>
    </>
  );
}
