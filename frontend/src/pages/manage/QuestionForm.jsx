import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useFlash } from '../../lib/flash.jsx';
import { useApi, useTitle } from '../../lib/useApi.js';
import Icon from '../../components/Icon.jsx';
import { Crumbs, Errors, Guard } from '../../components/ui.jsx';

const blankRows = (n) => Array.from({ length: n }, () => ({ body: '', isCorrect: false }));

export default function QuestionForm() {
  const { id, quizId } = useParams(); // id = question (edit), quizId = quiz (new)
  const editing = !!id;
  const { meta } = useAuth();
  const { flash } = useFlash();
  const navigate = useNavigate();
  const state = useApi(editing ? `/manage/questions/${id}` : `/manage/quizzes/${quizId}/question-form`);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  useTitle(editing ? 'Edit question' : 'New question', meta.appName);

  const reset = (q) => {
    const isTf = q?.type === 'truefalse';
    const rows = !q || isTf ? [] : q.choices.map((c) => ({ body: c.body, isCorrect: c.isCorrect }));
    while (rows.length < 4) rows.push({ body: '', isCorrect: false });
    const tfCorrect = isTf ? q.choices.find((c) => c.isCorrect) : null;
    setForm({
      body: q?.body || '',
      type: q?.type || 'single',
      points: q?.points ?? 1,
      explanation: q?.explanation || '',
      choices: rows,
      tfAnswer: tfCorrect && tfCorrect.body.toLowerCase() === 'false' ? 'false' : 'true',
    });
  };

  useEffect(() => {
    if (state.data) reset(state.data.question);
  }, [state.data]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setChoice = (i, patch) =>
    setForm((f) => ({
      ...f,
      choices: f.choices.map((c, j) => {
        if (j === i) return { ...c, ...patch };
        // Single-answer questions: ticking one option unticks the others
        if (patch.isCorrect && f.type === 'single') return { ...c, isCorrect: false };
        return c;
      }),
    }));

  const save = async (then) => {
    setBusy(true);
    setErrors([]);
    try {
      const res = editing ? await api.put(`/manage/questions/${id}`, form) : await api.post(`/manage/quizzes/${quizId}/questions`, form);
      flash('success', res.message);
      if (then === 'another') {
        reset(null);
        setBusy(false);
        window.scrollTo(0, 0);
      } else {
        navigate(`/manage/quizzes/${state.data.quiz._id}`);
      }
    } catch (err) {
      setErrors(err.errors);
      setBusy(false);
    }
  };

  return (
    <Guard state={{ ...state, data: form && state.data }}>
      {({ quiz, course }) => (
        <>
          <Crumbs items={[[course.title, `/manage/courses/${course._id}`], [quiz.title, `/manage/quizzes/${quiz._id}`], [editing ? 'Edit question' : 'New question']]} />
          <div className="page-head"><div><h1>{editing ? 'Edit question' : 'New question'}</h1></div></div>
          <form onSubmit={(e) => { e.preventDefault(); save('done'); }} className="card form">
            <Errors errors={errors} />
            <label className="field"><span>Question</span><textarea rows={3} value={form.body} onChange={set('body')} required /></label>
            <div className="grid-2">
              <label className="field"><span>Type</span>
                <select value={form.type} onChange={set('type')}>
                  <option value="single">Single answer (radio buttons)</option>
                  <option value="multiple">Multiple answers (checkboxes)</option>
                  <option value="truefalse">True / false</option>
                </select>
              </label>
              <label className="field"><span>Points</span><input type="number" min={1} max={100} value={form.points} onChange={set('points')} /></label>
            </div>

            {form.type !== 'truefalse' ? (
              <fieldset className="field">
                <legend className="label">Answer options <small className="muted">— tick the correct one(s); empty rows are ignored</small></legend>
                <div className="choice-editor">
                  {form.choices.map((c, i) => (
                    <div key={i} className="choice-row">
                      <input type="checkbox" checked={c.isCorrect} onChange={(e) => setChoice(i, { isCorrect: e.target.checked })} aria-label="Correct answer" />
                      <input value={c.body} onChange={(e) => setChoice(i, { body: e.target.value })} placeholder={`Option ${i + 1}`} maxLength={500} />
                    </div>
                  ))}
                </div>
                {form.choices.length < 10 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm({ ...form, choices: [...form.choices, ...blankRows(1)] })}>
                    <Icon name="plus" />Add option
                  </button>
                )}
              </fieldset>
            ) : (
              <fieldset className="field">
                <legend className="label">Correct answer</legend>
                <label className="check"><input type="radio" name="tf" checked={form.tfAnswer === 'true'} onChange={() => setForm({ ...form, tfAnswer: 'true' })} /> <span>True</span></label>
                <label className="check"><input type="radio" name="tf" checked={form.tfAnswer === 'false'} onChange={() => setForm({ ...form, tfAnswer: 'false' })} /> <span>False</span></label>
              </fieldset>
            )}

            <label className="field"><span>Explanation <small className="muted">(optional) — shown after submitting, if answers are shown</small></span><textarea rows={2} value={form.explanation} onChange={set('explanation')} /></label>
            <div className="actions">
              <button className="btn btn-primary" type="submit" disabled={busy}>{editing ? 'Save question' : 'Save'}</button>
              {!editing && <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => save('another')}>Save and add another</button>}
              <Link className="btn btn-ghost" to={`/manage/quizzes/${quiz._id}`}>Cancel</Link>
            </div>
          </form>
        </>
      )}
    </Guard>
  );
}
