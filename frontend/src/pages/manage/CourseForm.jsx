import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useFlash } from '../../lib/flash.jsx';
import { useApi, useTitle } from '../../lib/useApi.js';
import Icon from '../../components/Icon.jsx';
import { Crumbs, Errors, Guard } from '../../components/ui.jsx';

const BLANK = { title: '', summary: '', category: '', status: 'draft', selfEnrol: false, certificateEnabled: true, certificateRequiresApproval: false, department: '' };
const STATUS_LABELS = {
  draft: 'Draft — hidden from learners',
  published: 'Published — visible to enrolled learners',
  archived: 'Archived — hidden, results kept',
};

export default function CourseForm() {
  const { id } = useParams();
  const { meta } = useAuth();
  const { flash } = useFlash();
  const navigate = useNavigate();
  const state = useApi(id ? `/manage/courses/${id}` : '/manage/categories');
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [deleteError, setDeleteError] = useState(null);
  useTitle(id ? 'Edit course' : 'New course', meta.appName);

  useEffect(() => {
    if (!state.data) return;
    const c = state.data.course;
    const firstDept = !state.data.canChooseNoDepartment && state.data.departments?.length ? String(state.data.departments[0]._id) : '';
    setForm(c ? {
      title: c.title, summary: c.summary || '', category: c.category || '', status: c.status, selfEnrol: c.selfEnrol, certificateEnabled: c.certificateEnabled,
      certificateRequiresApproval: !!c.certificateRequiresApproval, department: c.department ? String(c.department) : '',
    } : { ...BLANK, department: firstDept });
  }, [state.data]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    try {
      const res = id ? await api.put(`/manage/courses/${id}`, form) : await api.post('/manage/courses', form);
      flash('success', res.message);
      navigate(`/manage/courses/${res.course._id}`);
    } catch (err) {
      setErrors(err.errors);
      setBusy(false);
    }
  };

  const remove = async (e) => {
    e.preventDefault();
    setDeleteError(null);
    try {
      const res = await api.del(`/manage/courses/${id}`, { confirmTitle });
      flash('success', res.message);
      navigate('/manage/courses');
    } catch (err) {
      setDeleteError(err.message);
    }
  };

  return (
    <Guard state={{ ...state, data: form && state.data }}>
      {(data) => (
        <>
          <Crumbs items={id ? [['Manage courses', '/manage/courses'], [data.course.title, `/manage/courses/${id}`], ['Settings']] : [['Manage courses', '/manage/courses'], ['New course']]} />
          <div className="page-head"><div><h1>{id ? 'Course settings' : 'New course'}</h1></div></div>
          <form onSubmit={save} className="card form">
            <Errors errors={errors} />
            <label className="field"><span>Title</span><input value={form.title} onChange={set('title')} maxLength={200} required /></label>
            <label className="field"><span>Summary <small className="muted">— shown on the course card and page</small></span><textarea rows={4} value={form.summary} onChange={set('summary')} /></label>
            <div className="grid-2">
              <label className="field"><span>Category</span>
                <input value={form.category} onChange={set('category')} list="categories" placeholder="e.g. Onboarding, Compliance, Sales" />
                <datalist id="categories">{(data.categories || []).map((c) => <option key={c} value={c} />)}</datalist>
              </label>
              <label className="field"><span>Status</span>
                <select value={form.status} onChange={set('status')}>
                  {Object.entries(STATUS_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </label>
            </div>
            <label className="field"><span>Department</span>
              <select value={form.department} onChange={set('department')} required={!data.canChooseNoDepartment}>
                {data.canChooseNoDepartment && <option value="">Institution-wide (no department)</option>}
                {(data.departments || []).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
              <small className="muted">Department courses are managed by that department’s Head; when open to join, only its students see them.</small>
            </label>
            <label className="check"><input type="checkbox" checked={form.selfEnrol} onChange={set('selfEnrol')} /> <span><strong>Open to join</strong> — approved students (of the course’s department, if it has one) can join without being assigned</span></label>
            <label className="check"><input type="checkbox" checked={form.certificateEnabled} onChange={set('certificateEnabled')} /> <span><strong>Issue a certificate</strong> when a learner finishes every lesson and passes every quiz</span></label>
            {form.certificateEnabled && (
              <label className="check"><input type="checkbox" checked={form.certificateRequiresApproval} onChange={set('certificateRequiresApproval')} /> <span><strong>Certificates need authorisation</strong> — the Department Head (or an administrator) must authorise each certificate before it is issued</span></label>
            )}
            <div className="actions">
              <button className="btn btn-primary" type="submit" disabled={busy}>{id ? 'Save changes' : 'Create course'}</button>
              <Link className="btn btn-ghost" to={id ? `/manage/courses/${id}` : '/manage/courses'}>Cancel</Link>
            </div>
          </form>

          {id && (
            <form onSubmit={remove} className="card form danger-zone">
              <h2>Delete course</h2>
              <p className="muted small">This permanently removes the course with its lessons, quizzes, enrolments, results and certificates. To keep results, set the status to Archived instead.</p>
              {deleteError && <div className="flash flash-error" role="alert">{deleteError}</div>}
              <label className="field"><span>Type the course title to confirm</span><input value={confirmTitle} onChange={(e) => setConfirmTitle(e.target.value)} autoComplete="off" /></label>
              <div className="actions"><button className="btn btn-danger" type="submit"><Icon name="trash" />Delete permanently</button></div>
            </form>
          )}
        </>
      )}
    </Guard>
  );
}
