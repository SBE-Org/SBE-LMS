import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useFlash } from '../../lib/flash.jsx';
import { useApi, useTitle } from '../../lib/useApi.js';
import Icon from '../../components/Icon.jsx';
import { Crumbs, Errors, Guard } from '../../components/ui.jsx';

export default function DepartmentForm() {
  const { id } = useParams();
  const { meta, refreshMeta } = useAuth();
  const { flash } = useFlash();
  const navigate = useNavigate();
  const state = useApi(id ? `/admin/departments/${id}` : null);
  const [form, setForm] = useState(id ? null : { name: '', code: '', description: '', programs: '', active: true });
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  useTitle(id ? 'Edit department' : 'New department', meta.appName);

  useEffect(() => {
    const d = state.data?.department;
    if (d) setForm({ name: d.name, code: d.code, description: d.description || '', programs: (d.programs || []).join('\n'), active: d.active });
  }, [state.data]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    try {
      const res = id ? await api.put(`/admin/departments/${id}`, form) : await api.post('/admin/departments', form);
      flash('success', res.message);
      refreshMeta();
      navigate('/admin/departments');
    } catch (err) {
      setErrors(err.errors);
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!window.confirm('Delete this department? This only works when no people or courses use it.')) return;
    try {
      flash('success', (await api.del(`/admin/departments/${id}`)).message);
      refreshMeta();
      navigate('/admin/departments');
    } catch (err) {
      setErrors(err.errors);
    }
  };

  const body = (heads = []) => (
    <>
      <Crumbs items={[['Departments', '/admin/departments'], [id ? form.name || 'Edit' : 'New department']]} />
      <div className="page-head"><div><h1>{id ? 'Edit department' : 'New department'}</h1></div></div>
      <form onSubmit={save} className="card form">
        <Errors errors={errors} />
        <div className="grid-2">
          <label className="field"><span>Name</span><input value={form.name} onChange={set('name')} maxLength={120} required /></label>
          <label className="field"><span>Code <small className="muted">— short, unique, e.g. CS</small></span><input value={form.code} onChange={set('code')} maxLength={20} required pattern="[A-Za-z0-9_\-]+" /></label>
        </div>
        <label className="field"><span>Description</span><textarea rows={2} value={form.description} onChange={set('description')} maxLength={1000} /></label>
        <label className="field"><span>Programs / courses offered <small className="muted">— one per line; students pick one when registering</small></span><textarea rows={4} value={form.programs} onChange={set('programs')} /></label>
        <label className="check"><input type="checkbox" checked={form.active} onChange={set('active')} /> <span><strong>Active</strong> — inactive departments are hidden from the registration form; their records are kept.</span></label>
        {id && (
          <p className="small muted">Department Head{heads.length === 1 ? '' : 's'}: {heads.length ? heads.map((h) => h.name).join(', ') : 'none yet'} — <Link to="/admin/users?role=department_head">assign on the People page</Link>.</p>
        )}
        <div className="actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>{id ? 'Save' : 'Create department'}</button>
          <Link className="btn btn-ghost" to="/admin/departments">Cancel</Link>
          {id && <button type="button" className="btn btn-ghost danger" onClick={remove}><Icon name="trash" />Delete</button>}
        </div>
      </form>
    </>
  );

  if (!id) return body();
  return <Guard state={{ ...state, data: form && state.data }}>{(d) => body(d.heads)}</Guard>;
}
