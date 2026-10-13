import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useFlash } from '../../lib/flash.jsx';
import { useApi, useTitle } from '../../lib/useApi.js';
import { capitalize, plural } from '../../lib/format.js';
import Icon from '../../components/Icon.jsx';
import { ActionButton, Badge, Crumbs, Guard, LessonIcon, STATUS_TONE } from '../../components/ui.jsx';

function ModuleTitle({ module, onRenamed }) {
  const [title, setTitle] = useState(module.title);
  const { flash } = useFlash();
  const save = async (e) => {
    e.preventDefault();
    try {
      const res = await api.put(`/manage/modules/${module._id}`, { title });
      flash('success', res.message);
      onRenamed();
    } catch (err) {
      flash('error', err.message);
    }
  };
  return (
    <form onSubmit={save} className="rename-form">
      <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Module title" maxLength={200} required />
      <button className="btn btn-ghost btn-sm" type="submit">Rename</button>
    </form>
  );
}

export default function Builder() {
  const { id } = useParams();
  const { meta } = useAuth();
  const { flash } = useFlash();
  const state = useApi(`/manage/courses/${id}`);
  const [newModule, setNewModule] = useState('');
  useTitle(state.data?.course.title, meta.appName);

  /** Runs an API call, shows its message and reloads the page data. */
  const act = (fn) => async () => {
    try {
      const res = await fn();
      if (res?.message) flash('success', res.message);
    } catch (e) {
      flash('error', e.message);
    }
    state.reload();
  };

  const addModule = async (e) => {
    e.preventDefault();
    await act(() => api.post(`/manage/courses/${id}/modules`, { title: newModule }))();
    setNewModule('');
  };

  return (
    <Guard state={state}>
      {({ course, modules, quizzes, enrolled }) => (
        <>
          <Crumbs items={[['Manage courses', '/manage/courses'], [course.title]]} />
          <div className="page-head">
            <div>
              <h1>{course.title}</h1>
              <p className="muted"><Badge tone={STATUS_TONE[course.status]}>{capitalize(course.status)}</Badge> · {course.category || 'General'} · {plural(enrolled, 'learner')} enrolled</p>
            </div>
            <div className="actions">
              <Link className="btn btn-ghost" to={`/courses/${course._id}`}><Icon name="eye" />Preview</Link>
              <Link className="btn btn-ghost" to={`/manage/courses/${course._id}/edit`}><Icon name="edit" />Settings</Link>
              <Link className="btn btn-ghost" to={`/reports/courses/${course._id}`}><Icon name="chart" />Report</Link>
              <Link className="btn btn-primary" to={`/manage/courses/${course._id}/enrolments`}><Icon name="users" />Enrol learners</Link>
            </div>
          </div>

          {course.status === 'draft' && (
            <div className="flash flash-info">This course is a draft. Learners will see it once you set its status to Published in <Link to={`/manage/courses/${course._id}/edit`}>Settings</Link>.</div>
          )}

          <section className="section">
            <div className="section-head"><h2>Modules and lessons</h2></div>
            {modules.map((m, i) => (
              <div key={m._id} className="module card builder-module">
                <div className="module-head">
                  <span className="module-num">{i + 1}</span>
                  <ModuleTitle key={m.title} module={m} onRenamed={state.reload} />
                  <div className="row-actions">
                    <ActionButton className="icon-btn" label="Move up" onAction={act(() => api.post(`/manage/modules/${m._id}/move`, { dir: 'up' }))}><Icon name="up" /></ActionButton>
                    <ActionButton className="icon-btn" label="Move down" onAction={act(() => api.post(`/manage/modules/${m._id}/move`, { dir: 'down' }))}><Icon name="down" /></ActionButton>
                    <ActionButton
                      className="icon-btn danger"
                      label="Delete"
                      confirm={`Delete the module “${m.title}” and all ${m.lessons.length} lessons in it?`}
                      onAction={act(() => api.del(`/manage/modules/${m._id}`))}
                    ><Icon name="trash" /></ActionButton>
                  </div>
                </div>
                <ol className="builder-list">
                  {m.lessons.map((l) => (
                    <li key={l._id}>
                      <span className="status-dot"><LessonIcon type={l.type} /></span>
                      <Link to={`/manage/lessons/${l._id}/edit`} className="builder-title">{l.title}</Link>
                      <span className="small muted">
                        {capitalize(l.type)}{l.durationMin ? ` · ${l.durationMin} min` : ''}{l.file?.name ? ` · ${l.file.name}` : ''}
                      </span>
                      <span className="row-actions">
                        <ActionButton className="icon-btn" label="Move up" onAction={act(() => api.post(`/manage/lessons/${l._id}/move`, { dir: 'up' }))}><Icon name="up" /></ActionButton>
                        <ActionButton className="icon-btn" label="Move down" onAction={act(() => api.post(`/manage/lessons/${l._id}/move`, { dir: 'down' }))}><Icon name="down" /></ActionButton>
                        <Link className="icon-btn" to={`/manage/lessons/${l._id}/edit`} aria-label="Edit lesson"><Icon name="edit" /></Link>
                        <ActionButton className="icon-btn danger" label="Delete" confirm={`Delete the lesson “${l.title}”?`} onAction={act(() => api.del(`/manage/lessons/${l._id}`))}>
                          <Icon name="trash" />
                        </ActionButton>
                      </span>
                    </li>
                  ))}
                  {!m.lessons.length && <li className="muted small">No lessons yet.</li>}
                </ol>
                <Link className="btn btn-ghost btn-sm add-btn" to={`/manage/modules/${m._id}/lessons/new`}><Icon name="plus" />Add lesson</Link>
              </div>
            ))}
            <form onSubmit={addModule} className="card inline-add">
              <input value={newModule} onChange={(e) => setNewModule(e.target.value)} placeholder="New module title, e.g. “Module 2: Handling complaints”" aria-label="New module title" maxLength={200} required />
              <button className="btn btn-ghost" type="submit"><Icon name="plus" />Add module</button>
            </form>
          </section>

          <section className="section">
            <div className="section-head">
              <h2>Quizzes</h2>
              <Link className="btn btn-ghost btn-sm" to={`/manage/courses/${course._id}/quizzes/new`}><Icon name="plus" />Add quiz</Link>
            </div>
            {!quizzes.length ? (
              <div className="empty-state card"><p className="muted">No quizzes yet. Learners complete the course by finishing every lesson (and passing every quiz, if there are any).</p></div>
            ) : (
              <div className="card table-wrap">
                <table className="table">
                  <thead><tr><th>Quiz</th><th>Questions</th><th>Pass mark</th><th>Time</th><th>Attempts</th><th /></tr></thead>
                  <tbody>
                    {quizzes.map((q) => (
                      <tr key={q._id}>
                        <td><Link to={`/manage/quizzes/${q._id}`}><strong>{q.title}</strong></Link></td>
                        <td>{q.questionCount} <span className="muted small">({q.totalPoints} pts)</span>{q.questionCount === 0 && <> <Badge tone="warning">Needs questions</Badge></>}</td>
                        <td>{q.passMark}%</td>
                        <td>{q.timeLimitMin ? `${q.timeLimitMin} min` : '—'}</td>
                        <td>{q.maxAttempts || 'Unlimited'}</td>
                        <td className="right"><Link className="btn btn-ghost btn-sm" to={`/manage/quizzes/${q._id}`}><Icon name="edit" />Questions</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </Guard>
  );
}
