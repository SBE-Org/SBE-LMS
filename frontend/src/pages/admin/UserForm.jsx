import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useFlash } from '../../lib/flash.jsx';
import { useApi, useTitle } from '../../lib/useApi.js';
import { ROLES, REG_STATUS } from '../../lib/format.js';
import { Badge, Crumbs, Errors, Guard } from '../../components/ui.jsx';

const ACCOUNT_HELP = {
  active: 'Can sign in.',
  suspended: 'Temporarily blocked from signing in (e.g. under investigation). Records and registration are kept.',
  deactivated: 'Cannot sign in (e.g. left the institution). Records are kept.',
};

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
      department: u?.department ? String(u.department) : '', departments: (u?.departments || []).map(String),
      permApproveRegistrations: !!u?.permissions?.approveRegistrations, permAuthorizeCertificates: !!u?.permissions?.authorizeCertificates,
      employeeId: u?.employeeId || '', password: '', accountStatus: u?.accountStatus || 'active',
      approveRegistration: false, overrideReason: '',
    });
  }, [state.data]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const toggleDept = (d, on) => setForm({ ...form, departments: on ? [...form.departments, d] : form.departments.filter((x) => x !== d) });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    try {
      const body = { ...form, active: form.accountStatus === 'active' };
      const res = editing ? await api.put(`/admin/users/${id}`, body) : await api.post('/admin/users', body);
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
      {({ user, teams, departments = [], accountStatuses = {} }) => {
        const role = form.role;
        const scoped = role === 'department_head' || role === 'registrar';
        const reg = user?.registration?.status;
        return (
          <>
            <Crumbs items={[['People', '/admin/users'], [editing ? user.name : 'Add person']]} />
            <div className="page-head">
              <div><h1>{editing ? 'Edit person' : 'Add person'}</h1>
                {editing && role === 'agent' && reg && <p className="muted">Registration: <Badge tone={REG_STATUS[reg]?.[1]}>{REG_STATUS[reg]?.[0]}</Badge> · <Link to={`/registrations/${user._id}`}>Open application</Link></p>}
              </div>
            </div>
            {!editing && role === 'agent' && (
              <div className="flash flash-info">To register a student with all registration details and documents, use <Link to="/registrations/new">Register a student</Link>. This form creates a basic account whose registration is pending review.</div>
            )}
            <form onSubmit={save} className="card form">
              <Errors errors={errors} />
              <div className="grid-2">
                <label className="field"><span>Full name</span><input value={form.name} onChange={set('name')} maxLength={120} required /></label>
                <label className="field"><span>Email <small className="muted">— used to sign in</small></span><input type="email" value={form.email} onChange={set('email')} maxLength={190} required /></label>
              </div>
              <div className="grid-3">
                <label className="field"><span>Role</span>
                  <select value={form.role} onChange={set('role')}>
                    {Object.entries(ROLES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                </label>
                <label className="field"><span>{role === 'agent' ? 'Department' : 'Home department'} {role === 'agent' && !editing && <span className="req">*</span>}</span>
                  <select value={form.department} onChange={set('department')} required={role === 'agent' && !editing}>
                    <option value="">None</option>
                    {departments.map((d) => <option key={d._id} value={d._id}>{d.name}{d.active ? '' : ' (inactive)'}</option>)}
                  </select>
                </label>
                <label className="field"><span>Employee / student ID <small className="muted">(optional)</small></span><input value={form.employeeId} onChange={set('employeeId')} maxLength={50} /></label>
              </div>
              <label className="field"><span>Team <small className="muted">(optional)</small></span>
                <select value={form.team} onChange={set('team')}>
                  <option value="">No team</option>
                  {teams.map((t) => <option key={t._id} value={t._id}>{t.name}{t.campaign ? ` — ${t.campaign}` : ''}</option>)}
                </select>
              </label>

              {scoped && (
                <fieldset className="field">
                  <legend className="label">{role === 'department_head' ? 'Departments this Department Head manages' : 'Departments this registrar works for'}</legend>
                  <div className="check-list">
                    {departments.map((d) => (
                      <label key={d._id} className="check"><input type="checkbox" checked={form.departments.includes(String(d._id))} onChange={(e) => toggleDept(String(d._id), e.target.checked)} /> <span>{d.name}</span></label>
                    ))}
                    {!departments.length && <p className="muted small">No departments yet. <Link to="/admin/departments/new">Create one</Link>.</p>}
                  </div>
                  {role === 'registrar' && <small className="muted">Leave all unticked for a registrar who works for every department.</small>}
                </fieldset>
              )}
              {(role === 'registrar' || role === 'trainer') && (
                <fieldset className="field">
                  <legend className="label">Extra permissions <small className="muted">— not granted by default</small></legend>
                  {role === 'registrar' && (
                    <label className="check"><input type="checkbox" checked={form.permApproveRegistrations} onChange={set('permApproveRegistrations')} /> <span><strong>May approve or reject registrations</strong> in their departments (normally the Department Head’s decision)</span></label>
                  )}
                  <label className="check"><input type="checkbox" checked={form.permAuthorizeCertificates} onChange={set('permAuthorizeCertificates')} /> <span><strong>May authorise certificates</strong>{role === 'registrar' ? ' in their departments' : ''}</span></label>
                </fieldset>
              )}

              <details className="help small">
                <summary>What each role can do</summary>
                <ul>
                  <li><strong>Student</strong> — registers, and after approval takes courses and quizzes and earns certificates.</li>
                  <li><strong>Registrar</strong> — creates student accounts, completes and corrects registrations, tracks and exports them. Cannot approve unless permitted above.</li>
                  <li><strong>Department Head</strong> — reviews and decides registrations, builds and runs the courses of their departments, sees their reports and authorises certificates.</li>
                  <li><strong>Team Lead</strong> — reports for the teams they lead (set the lead on the team page).</li>
                  <li><strong>Trainer</strong> — builds all courses and quizzes, enrols people and teams, sees all reports.</li>
                  <li><strong>System Administrator</strong> — everything, including people, departments, branding, settings and the audit log.</li>
                </ul>
              </details>

              <div className="grid-2">
                <label className="field"><span>Account status</span>
                  <select value={form.accountStatus} onChange={set('accountStatus')}>
                    {Object.entries(accountStatuses).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                  <small className="muted">{ACCOUNT_HELP[form.accountStatus]}</small>
                </label>
                <label className="field">
                  <span>{editing ? 'Set a new password' : 'Password'} <small className="muted">— {editing ? 'leave empty to keep' : 'leave empty to generate'}</small></span>
                  <input type="text" value={form.password} onChange={set('password')} minLength={8} autoComplete="off" placeholder={editing ? '••••••••' : 'Generate automatically'} />
                  <small className="muted">They must change it at their next sign-in.</small>
                </label>
              </div>

              {!editing && role === 'agent' && (
                <fieldset className="field override">
                  <label className="check"><input type="checkbox" checked={form.approveRegistration} onChange={set('approveRegistration')} /> <span><strong>Approve the registration now</strong> — an administrator override, recorded in the audit log</span></label>
                  {form.approveRegistration && (
                    <label className="field"><span>Reason for the override <span className="req">*</span></span><input value={form.overrideReason} onChange={set('overrideReason')} maxLength={500} required minLength={5} /></label>
                  )}
                </fieldset>
              )}

              <div className="actions">
                <button className="btn btn-primary" type="submit" disabled={busy}>{editing ? 'Save' : 'Add person'}</button>
                <Link className="btn btn-ghost" to="/admin/users">Cancel</Link>
              </div>
            </form>
          </>
        );
      }}
    </Guard>
  );
}
