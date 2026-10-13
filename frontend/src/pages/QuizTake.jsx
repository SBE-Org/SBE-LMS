import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useFlash } from '../lib/flash.jsx';
import { useApi, useTitle } from '../lib/useApi.js';
import { plural } from '../lib/format.js';
import Icon from '../components/Icon.jsx';
import { Guard } from '../components/ui.jsx';

function Timer({ seconds, onExpire }) {
  const [left, setLeft] = useState(seconds);
  const end = useRef(Date.now() + seconds * 1000);
  useEffect(() => {
    const iv = setInterval(() => {
      const s = Math.max(0, Math.round((end.current - Date.now()) / 1000));
      setLeft(s);
      if (s <= 0) {
        clearInterval(iv);
        onExpire();
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [onExpire]);
  const m = Math.floor(left / 60);
  const r = left % 60;
  return (
    <span className={`timer ${left <= 60 ? 'is-low' : ''}`} role="timer" aria-live={left <= 60 ? 'assertive' : 'off'}>
      <Icon name="clock" />
      <span>{String(m).padStart(2, '0')}:{String(r).padStart(2, '0')}</span>
    </span>
  );
}

function QuizForm({ data, attemptId }) {
  const { attempt, quiz, course, questions, secondsLeft } = data;
  const navigate = useNavigate();
  const { flash } = useFlash();
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false);
  const dirty = Object.keys(answers).length > 0;
  const answered = questions.filter((q) => answers[q._id]?.length).length;

  // Warn before leaving the page with unsaved answers
  useEffect(() => {
    const h = (e) => {
      if (dirty && !submitted.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const answersRef = useRef(answers);
  answersRef.current = answers;

  const submit = useCallback(async (force = false) => {
    if (submitted.current) return;
    const left = questions.length - questions.filter((q) => answersRef.current[q._id]?.length).length;
    if (!force && left > 0 && !window.confirm(`${left} question${left === 1 ? ' is' : 's are'} not answered. Submit anyway?`)) return;
    submitted.current = true;
    setBusy(true);
    try {
      const res = await api.post(`/attempts/${attemptId}`, { answers: answersRef.current });
      if (res.message) flash('error', res.message);
      navigate(`/attempts/${attemptId}/result`, { replace: true });
    } catch (e) {
      submitted.current = false;
      setBusy(false);
      flash('error', e.message);
    }
  }, [attemptId, questions, navigate, flash]);

  const expire = useCallback(() => submit(true), [submit]);

  const pick = (q, choiceId, checked) => {
    setAnswers((a) => {
      const cur = a[q._id] || [];
      const next = q.type === 'multiple' ? (checked ? [...cur, choiceId] : cur.filter((x) => x !== choiceId)) : [choiceId];
      return { ...a, [q._id]: next };
    });
  };

  return (
    <>
      <div className="quiz-bar">
        <div><p className="eyebrow">{course.title}</p><h1>{quiz.title}</h1></div>
        <div className="quiz-bar-side">
          <span className="small muted">{answered}/{questions.length} answered</span>
          {secondsLeft !== null && <Timer key={attempt._id} seconds={secondsLeft} onExpire={expire} />}
        </div>
      </div>
      <form className="quiz-form" onSubmit={(e) => { e.preventDefault(); submit(false); }}>
        {questions.map((q, n) => {
          const multi = q.type === 'multiple';
          return (
            <fieldset key={q._id} className="question card">
              <legend>
                <span className="q-num">{n + 1}</span>
                <span className="q-body">{q.body.split('\n').map((l, i) => <Fragment key={i}>{i > 0 && <br />}{l}</Fragment>)}</span>
              </legend>
              <p className="small muted q-hint">{multi ? 'Select all that apply' : 'Select one answer'} · {plural(q.points, 'point')}</p>
              <div className="choices">
                {q.choices.map((c) => (
                  <label key={c._id} className="choice">
                    <input
                      type={multi ? 'checkbox' : 'radio'}
                      name={`q-${q._id}`}
                      value={c._id}
                      checked={(answers[q._id] || []).includes(c._id)}
                      onChange={(e) => pick(q, c._id, e.target.checked)}
                    />
                    <span>{c.body}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
        <div className="quiz-submit card">
          <p className="muted small">Check your answers, then submit. You cannot change them afterwards.</p>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit answers'}</button>
        </div>
      </form>
    </>
  );
}

export default function QuizTake() {
  const { id } = useParams();
  const { meta } = useAuth();
  const { flash } = useFlash();
  const state = useApi(`/attempts/${id}`);
  useTitle(state.data?.quiz?.title, meta.appName);

  const done = state.data?.status === 'submitted';
  useEffect(() => {
    if (done && state.data.message) flash('error', state.data.message);
  }, [done, state.data, flash]);
  if (done) return <Navigate to={`/attempts/${id}/result`} replace />;

  return <Guard state={state}>{(data) => <QuizForm data={data} attemptId={id} />}</Guard>;
}
