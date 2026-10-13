import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useFlash } from '../../lib/flash.jsx';
import { useApi, useTitle } from '../../lib/useApi.js';
import { initials, ROLES } from '../../lib/format.js';
import Icon from '../../components/Icon.jsx';
import { ActionButton, Crumbs, Errors, Guard } from '../../components/ui.jsx';

export default function TeamForm() {
  const { id } = useParams();
  const editing = !!id;
  const { meta } = useAuth();
  const { flash } = useFlash();
  const navigate = useNavigate();
  const state = useApi(editing ? `/admin/teams/${id}` : '/admin/team-form');
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  useTitle(editing ? 'Edit team' : 'New team', meta.appName);

  useEffect(() => {
    if (!state.data) return;
    const t = state.data.team;
    setForm({ name: t?.name || '', campaign: t?.campaign || '', lead: t?.lead ? String(t.lead) : '' });
  }, [state.data]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    try {
      const res = editing ? await api.put(`/admin/teams/${id}`, form) : await api.post('/admin/teams', form);
      flash('success', res.message);
      navigate('/admin/teams');
    } catch (err) {
      setErrors(err.errors);
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      const res = await api.del(`/admin/teams/${id}`);
      flash('success', res.message);
      navigate('/admin/teams');
    } catch (err) {
      flash('error', err.message);
    }
  };

  return (
    <Guard state={{ ...state, data: form && state.data }}>
      {({ team, leads, members = [] }) => (
        <>
          <Crumbs items={[['Teams', '/admin/teams'], [editing ? team.name : 'New team']]} />
          <div className="page-head"><div><h1>{editing ? 'Edit team' : 'New team'}</h1></div></div>
          <form onSubmit={save} className="card form">
            <Errors errors={errors} />
            <div className="grid-2">
              <label className="field"><span>Team name</span><input value={form.name} onChange={set('name')} maxLength={120} required /></label>
              <label className="field"><span>Campaign / client <small className="muted">(optional)</small></span><input value={form.campaign} onChange={set('campaign')} maxLength={120} /></label>
            </div>
            <label className="field"><span>Team lead <small className="muted">— sees reports for this team</small></span>
              <select value={form.lead} onChange={set('lead')}>
                <option value="">No team lead</option>
                {leads.map((l) => <option key={l._id} value={l._id}>{l.name} ({ROLES[l.role] || l.role})</option>)}
              </select>
              <small className="muted">Only people with the Team Lead, Trainer or Administrator role are listed.</small>
            </label>
            <div className="actions">
              <button className="btn btn-primary" type="submit" disabled={busy}>{editing ? 'Save' : 'Create team'}</button>
              <Link className="btn btn-ghost" to="/admin/teams">Cancel</Link>
            </div>
          </form>

          {editing && (
            <>
              <section className="section">
                <h2>Members ({members.length})</h2>
                <p className="muted small">Change a person&apos;s team on their profile in <Link to="/admin/users">People</Link>.</p>
                <div className="card list">
                  {members.map((m) => (
                    <Link key={m._id} className="list-row" to={`/admin/users/${m._id}/edit`}>
                      <span className="avatar avatar-sm">{initials(m.name)}</span>
                      <span className="list-main"><strong>{m.name}</strong><small className="muted">{m.email} · {ROLES[m.role] || m.role}</small></span>
                    </Link>
                  ))}
                  {!members.length && <p className="muted pad">No members yet.</p>}
                </div>
              </section>
              <div className="card form danger-zone">
                <h2>Delete team</h2>
                <p className="muted small">Members are kept but will have no team. Their courses and progress are not affected.</p>
                <ActionButton className="btn btn-danger" confirm={`Delete the team “${team.name}”?`} onAction={remove}><Icon name="trash" />Delete team</ActionButton>
              </div>
            </>
          )}
        </>
      )}
    </Guard>
  );
}
