import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useFlash } from '../../lib/flash.jsx';
import { useApi, useTitle } from '../../lib/useApi.js';
import { ROLES } from '../../lib/format.js';
import { Crumbs, Errors, Guard } from '../../components/ui.jsx';

export default function UserForm() {
  const { id } = useParams();
  const editing = !!id;
  const { meta, user: me, setUser } = useAuth();
  const { flashAll } = useFlash();
  const navigate = useNavigate();
  const state = useApi(editing ? `/admin/users/${id}` : '/admin/user-form');
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  useTitle(editing ? 'Edit person' : 'Add person', meta.appName);

  useEffect(() => {
    if (!state.data) return;
    const u = state.data.user;
    setForm({
      name: u?.name || '', email: u?.email || '', role: u?.role || 'agent', team: u?.team ? String(u.team) : '',
      employeeId: u?.employeeId || '', password: '', active: u ? u.active : true,
    });
  }, [state.data]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    try {
      const res = editing ? await api.put(`/admin/users/${id}`, form) : await api.post('/admin/users', form);
      flashAll(res.messages);
      if (editing && String(id) === String(me._id)) setUser({ ...me, name: res.user.name, email: res.user.email });
      navigate('/admin/users');
    } catch (err) {
      setErrors(err.errors);
      setBusy(false);
    }
  };

  return (
    <Guard state={{ ...state, data: form && state.data }}>
      {({ user, teams }) => (
        <>
          <Crumbs items={[['People', '/admin/users'], [editing ? user.name : 'Add person']]} />
          <div className="page-head"><div><h1>{editing ? 'Edit person' : 'Add person'}</h1></div></div>
          <form onSubmit={save} className="card form">
            <Errors errors={errors} />
            <div className="grid-2">
              <label className="field"><span>Full name</span><input value={form.name} onChange={set('name')} maxLength={120} required /></label>
              <label className="field"><span>Work email <small className="muted">— used to sign in</small></span><input type="email" value={form.email} onChange={set('email')} maxLength={190} required /></label>
            </div>
            <div className="grid-3">
              <label className="field"><span>Role</span>
                <select value={form.role} onChange={set('role')}>
                  {Object.entries(ROLES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </label>
              <label className="field"><span>Team</span>
                <select value={form.team} onChange={set('team')}>
                  <option value="">No team</option>
                  {teams.map((t) => <option key={t._id} value={t._id}>{t.name}{t.campaign ? ` — ${t.campaign}` : ''}</option>)}
                </select>
              </label>
              <label className="field"><span>Employee ID <small className="muted">(optional)</small></span><input value={form.employeeId} onChange={set('employeeId')} maxLength={50} /></label>
            </div>
            <details className="help small" open>
              <summary>What each role can do</summary>
              <ul>
                <li><strong>Agent</strong> — takes assigned courses and quizzes, earns certificates.</li>
                <li><strong>Team Lead</strong> — everything an agent can do, plus reports for the teams they lead (set the lead on the team page).</li>
                <li><strong>Trainer</strong> — builds courses and quizzes, enrols people and teams, sees all reports.</li>
                <li><strong>Administrator</strong> — everything, plus managing people and teams.</li>
              </ul>
            </details>
            <label className="field">
              <span>{editing ? 'Set a new password' : 'Password'} <small className="muted">— {editing ? 'leave empty to keep the current one' : 'leave empty to generate one'}; they must change it at sign-in</small></span>
              <input type="text" value={form.password} onChange={set('password')} minLength={8} autoComplete="off" placeholder={editing ? '••••••••' : 'Generate automatically'} />
            </label>
            {editing && (
              <label className="check"><input type="checkbox" checked={form.active} onChange={set('active')} /> <span><strong>Active</strong> — untick to block sign-in (for people who have left). Their records are kept.</span></label>
            )}
            <div className="actions">
              <button className="btn btn-primary" type="submit" disabled={busy}>{editing ? 'Save' : 'Add person'}</button>
              <Link className="btn btn-ghost" to="/admin/users">Cancel</Link>
            </div>
          </form>
        </>
      )}
    </Guard>
  );
}
