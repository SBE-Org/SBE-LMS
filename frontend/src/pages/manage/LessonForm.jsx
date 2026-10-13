import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useFlash } from '../../lib/flash.jsx';
import { useApi, useTitle } from '../../lib/useApi.js';
import Icon from '../../components/Icon.jsx';
import { Crumbs, Errors, Guard } from '../../components/ui.jsx';

export default function LessonForm() {
  const { id, moduleId } = useParams(); // id = lesson (edit), moduleId = module (new)
  const editing = !!id;
  const { meta } = useAuth();
  const { flash } = useFlash();
  const navigate = useNavigate();
  const state = useApi(editing ? `/manage/lessons/${id}` : `/manage/modules/${moduleId}`);
  const [form, setForm] = useState(null);
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  useTitle(editing ? 'Edit lesson' : 'New lesson', meta.appName);

  useEffect(() => {
    if (!state.data) return;
    const l = state.data.lesson;
    setForm({
      title: l?.title || '',
      type: l?.type || 'text',
      moduleId: String(l?.module || state.data.module._id),
      durationMin: l?.durationMin ?? '',
      videoUrl: l?.videoUrl || '',
      body: l?.body || '',
      removeFile: false,
    });
  }, [state.data]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      // Fields hidden for the chosen type are not sent (like disabled inputs in the original form)
      if (k === 'videoUrl' && form.type !== 'video') return;
      fd.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v ?? ''));
    });
    if (file && form.type !== 'text') fd.append('file', file);
    try {
      const res = editing
        ? await api.put(`/manage/lessons/${id}`, fd)
        : await api.post(`/manage/modules/${moduleId}/lessons`, fd);
      flash('success', res.message);
      navigate(`/manage/courses/${res.courseId}`);
    } catch (err) {
      setErrors(err.errors);
      setBusy(false);
    }
  };

  return (
    <Guard state={{ ...state, data: form && state.data }}>
      {({ lesson, module, modules, course }) => (
        <>
          <Crumbs items={[['Manage courses', '/manage/courses'], [course.title, `/manage/courses/${course._id}`], [editing ? 'Edit lesson' : 'New lesson']]} />
          <div className="page-head">
            <div><h1>{editing ? 'Edit lesson' : 'New lesson'}</h1><p className="muted">Module: {module.title}</p></div>
            {editing && <Link className="btn btn-ghost" to={`/lessons/${lesson._id}`}><Icon name="eye" />Preview</Link>}
          </div>

          <form onSubmit={save} className="card form">
            <Errors errors={errors} />
            <label className="field"><span>Title</span><input value={form.title} onChange={set('title')} maxLength={200} required /></label>
            <div className="grid-3">
              <label className="field"><span>Lesson type</span>
                <select value={form.type} onChange={set('type')}>
                  <option value="text">Reading</option>
                  <option value="video">Video</option>
                  <option value="file">Document / file</option>
                </select>
              </label>
              <label className="field"><span>Module</span>
                <select value={form.moduleId} onChange={set('moduleId')}>
                  {modules.map((m) => <option key={m._id} value={m._id}>{m.title}</option>)}
                </select>
              </label>
              <label className="field"><span>Duration (minutes)</span><input type="number" min={0} max={600} value={form.durationMin} onChange={set('durationMin')} /></label>
            </div>

            {form.type === 'video' && (
              <div className="field">
                <label htmlFor="video_url"><span>Video link</span></label>
                <input id="video_url" value={form.videoUrl} onChange={set('videoUrl')} placeholder="https://www.youtube.com/watch?v=…  or a Vimeo / .mp4 link" />
                <small className="muted">Or upload the video file below. On slow connections, uploading to your own server is often faster for learners than YouTube.</small>
              </div>
            )}

            {(form.type === 'video' || form.type === 'file') && (
              <div className="field">
                <label htmlFor="file"><span>Upload file <small className="muted">— PDF, Word, PowerPoint, Excel, MP4, MP3, images · up to {meta.maxUploadMb || 200} MB</small></span></label>
                <input id="file" type="file" accept={(meta.uploadTypes || []).map((t) => `.${t}`).join(',')} onChange={(e) => setFile(e.target.files[0] || null)} />
                {lesson?.file?.name && (
                  <p className="small">Current file: <strong>{lesson.file.name}</strong> · <label className="check-inline"><input type="checkbox" checked={form.removeFile} onChange={set('removeFile')} /> remove it</label></p>
                )}
              </div>
            )}

            <label className="field"><span>Lesson text <small className="muted">— shown below any video or file</small></span>
              <textarea rows={14} className="mono" value={form.body} onChange={set('body')} />
            </label>
            <details className="help small">
              <summary>Formatting help</summary>
              <p><code># Heading</code> · <code>## Sub-heading</code> · <code>**bold**</code> · <code>*italic*</code> · <code>- bullet</code> · <code>1. numbered</code> · <code>&gt; tip or note</code> · <code>[link text](https://…)</code>. Leave a blank line between paragraphs.</p>
            </details>
            <div className="actions">
              <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save lesson' : 'Add lesson'}</button>
              <Link className="btn btn-ghost" to={`/manage/courses/${course._id}`}>Cancel</Link>
            </div>
          </form>
        </>
      )}
    </Guard>
  );
}
