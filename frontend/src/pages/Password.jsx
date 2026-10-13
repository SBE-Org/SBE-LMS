import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useFlash } from '../lib/flash.jsx';
import { useTitle } from '../lib/useApi.js';
import { Errors } from '../components/ui.jsx';

export default function Password() {
  const { user, signIn, meta } = useAuth();
  const { flash } = useFlash();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current: '', new: '', confirm: '' });
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  useTitle('Change password', meta.appName);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    try {
      const res = await api.post('/auth/password', form);
      signIn(res.token, res.user);
      flash('success', res.message);
      navigate('/');
    } catch (err) {
      setErrors(err.errors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Change password</h1>
          <p className="muted">{user.mustChangePassword ? 'You are using a temporary password. Choose your own to continue.' : 'Choose a password only you know.'}</p>
        </div>
      </div>
      <form onSubmit={submit} className="card form narrow">
        <Errors errors={errors} />
        <label className="field"><span>Current password</span><input type="password" value={form.current} onChange={set('current')} autoComplete="current-password" required /></label>
        <label className="field">
          <span>New password <small className="muted">(at least 8 characters)</small></span>
          <input type="password" value={form.new} onChange={set('new')} minLength={8} autoComplete="new-password" required />
        </label>
        <label className="field"><span>Repeat new password</span><input type="password" value={form.confirm} onChange={set('confirm')} minLength={8} autoComplete="new-password" required /></label>
        <div className="actions"><button className="btn btn-primary" type="submit" disabled={busy}>Save password</button></div>
      </form>
    </>
  );
}
