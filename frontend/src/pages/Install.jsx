import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useFlash } from '../lib/flash.jsx';
import { useTitle } from '../lib/useApi.js';
import { Errors } from '../components/ui.jsx';

/** First-run setup: creates the first administrator and (optionally) demo data. */
export default function Install() {
  const { meta, signIn, refreshMeta } = useAuth();
  const { flash } = useFlash();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', demo: true });
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  useTitle('Set up the platform', meta.appName);

  if (meta.installed) return <Navigate to="/login" replace />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    try {
      const res = await api.post('/install', form);
      signIn(res.token, res.user);
      await refreshMeta();
      flash('success', res.message);
      navigate('/', { replace: true });
    } catch (err) {
      setErrors(err.errors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card auth-card">
      <h1>Set up the platform</h1>
      <p className="muted">This creates the first administrator account. Database: <strong>MongoDB</strong>.</p>
      <Errors errors={errors} />
      <label className="field"><span>Administrator name</span><input value={form.name} onChange={set('name')} required /></label>
      <label className="field"><span>Administrator email</span><input type="email" value={form.email} onChange={set('email')} required /></label>
      <label className="field">
        <span>Password <small className="muted">(at least 8 characters)</small></span>
        <input type="password" value={form.password} onChange={set('password')} minLength={8} autoComplete="new-password" required />
      </label>
      <label className="check">
        <input type="checkbox" checked={form.demo} onChange={set('demo')} />{' '}
        <span>Load demo data: 3 teams, 16 people and 4 BPO training courses with quizzes (demo password <code>Welcome@123</code>)</span>
      </label>
      <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? 'Installing… (this can take a minute)' : 'Install'}</button>
    </form>
  );
}
