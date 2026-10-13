import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useFlash } from '../../lib/flash.jsx';
import { useApi, useTitle } from '../../lib/useApi.js';
import Icon from '../../components/Icon.jsx';
import { ActionButton, Crumbs, Errors, Guard } from '../../components/ui.jsx';

export default function QuizForm() {
  const { id, courseId } = useParams(); // id = quiz (edit), courseId = course (new)
  const editing = !!id;
  const { meta } = useAuth();
  const { flash } = useFlash();
  const navigate = useNavigate();
  const state = useApi(editing ? `/manage/quizzes/${id}` : `/manage/courses/${courseId}/quiz-form`);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  useTitle(editing ? 'Quiz settings' : 'New quiz', meta.appName);

  useEffect(() => {
    if (!state.data) return;
    const q = state.data.quiz;
    setForm({
      title: q?.title || '',
      description: q?.description || '',
      passMark: q?.passMark ?? 70,
      timeLimitMin: q?.timeLimitMin ?? '',
      maxAttempts: q?.maxAttempts ?? 0,
      showAnswers: q ? q.showAnswers : true,
      shuffleQuestions: q ? q.shuffleQuestions : false,
    });
  }, [state.data]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    try {
      const res = editing ? await api.put(`/manage/quizzes/${id}`, form) : await api.post(`/manage/courses/${courseId}/quizzes`, form);
      flash('success', res.message);
      navigate(`/manage/quizzes/${res.quiz._id}`);
    } catch (err) {
      setErrors(err.errors);
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      const res = await api.del(`/manage/quizzes/${id}`);
      flash('success', res.message);
      navigate(`/manage/courses/${res.courseId}`);
    } catch (err) {
      flash('error', err.message);
    }
  };

  return (
    <Guard state={{ ...state, data: form && state.data }}>
      {({ course }) => (
        <>
          <Crumbs items={[['Manage courses', '/manage/courses'], [course.title, `/manage/courses/${course._id}`], [editing ? 'Quiz settings' : 'New quiz']]} />
          <div className="page-head"><div><h1>{editing ? 'Quiz settings' : 'New quiz'}</h1></div></div>
          <form onSubmit={save} className="card form">
            <Errors errors={errors} />
            <label className="field"><span>Title</span><input value={form.title} onChange={set('title')} maxLength={200} required /></label>
            <label className="field"><span>Instructions <small className="muted">(optional)</small></span><textarea rows={3} value={form.description} onChange={set('description')} /></label>
            <div className="grid-3">
              <label className="field"><span>Pass mark (%)</span><input type="number" min={0} max={100} value={form.passMark} onChange={set('passMark')} required /></label>
              <label className="field"><span>Time limit (minutes)</span><input type="number" min={0} max={600} value={form.timeLimitMin} onChange={set('timeLimitMin')} placeholder="No limit" /></label>
              <label className="field"><span>Maximum attempts</span><input type="number" min={0} max={50} value={form.maxAttempts} onChange={set('maxAttempts')} /><small className="muted">0 = unlimited</small></label>
            </div>
            <label className="check"><input type="checkbox" checked={form.showAnswers} onChange={set('showAnswers')} /> <span><strong>Show correct answers</strong> to learners after they submit</span></label>
            <label className="check"><input type="checkbox" checked={form.shuffleQuestions} onChange={set('shuffleQuestions')} /> <span><strong>Shuffle question order</strong> for each attempt</span></label>
            <div className="actions">
              <button className="btn btn-primary" type="submit" disabled={busy}>{editing ? 'Save settings' : 'Create quiz'}</button>
              <Link className="btn btn-ghost" to={editing ? `/manage/quizzes/${id}` : `/manage/courses/${course._id}`}>Cancel</Link>
            </div>
          </form>
          {editing && (
            <div className="card form danger-zone">
              <h2>Delete quiz</h2>
              <p className="muted small">Removes the quiz, its questions and every learner&apos;s results for it.</p>
              <ActionButton className="btn btn-danger" confirm="Delete this quiz and all its results? This cannot be undone." onAction={remove}>
                <Icon name="trash" />Delete quiz
              </ActionButton>
            </div>
          )}
        </>
      )}
    </Guard>
  );
}
