import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { api, request } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useFlash } from '../lib/flash.jsx';
import { useApi, useTitle } from '../lib/useApi.js';
import { plural } from '../lib/format.js';
import Icon from '../components/Icon.jsx';
import { Guard } from '../components/ui.jsx';

/**
 * Countdown to a fixed end time. It checks the clock (not a counter), so it stays right when the tab was in
 * the background or the computer slept, and calls onExpire once when the time is up.
 */
function Timer({ seconds, onExpire }) {
  const [left, setLeft] = useState(seconds);
  const end = useRef(Date.now() + seconds * 1000);
  const fired = useRef(false);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;
  useEffect(() => {
    const tick = () => {
      const s = Math.max(0, Math.ceil((end.current - Date.now()) / 1000));
      setLeft(s);
      if (s <= 0 && !fired.current) {
        fired.current = true;
        expireRef.current();
      }
    };
    tick();
    const iv = setInterval(tick, 500);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', tick); };
  }, []);
  const m = Math.floor(left / 60);
  const r = left % 60;
  return (
    <span className={`timer ${left <= 60 ? 'is-low' : ''}`} role="timer" aria-live={left <= 60 ? 'assertive' : 'off'}>
      <Icon name="clock" />
      <span>{String(m).padStart(2, '0')}:{String(r).padStart(2, '0')}</span>
    </span>
  );
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function QuizForm({ data, attemptId }) {
  const { attempt, quiz, course, questions, secondsLeft, draft } = data;
  const navigate = useNavigate();
  const { flash } = useFlash();
  // Answers saved earlier (reload, other device) come back from the server
  const [answers, setAnswers] = useState(() => draft || {});
  const [busy, setBusy] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const submitted = useRef(false);
  const answered = questions.filter((q) => answers[q._id]?.length).length;

  const answersRef = useRef(answers);
  answersRef.current = answers;

  // ---- autosave: answers are kept on the server, so nothing is lost if the time runs out with the tab closed
  const savedJson = useRef(JSON.stringify(draft || {}));
  const saveTimer = useRef(null);
  const saveDraft = useCallback((keepalive = false) => {
    clearTimeout(saveTimer.current);
    const json = JSON.stringify(answersRef.current);
    if (submitted.current || json === savedJson.current) return;
    savedJson.current = json;
    request('PUT', `/attempts/${attemptId}/draft`, { answers: answersRef.current }, { keepalive })
      .catch(() => { savedJson.current = ''; }); // try again with the next change
  }, [attemptId]);
  useEffect(() => {
    saveTimer.current = setTimeout(saveDraft, 800);
    return () => clearTimeout(saveTimer.current);
  }, [answers, saveDraft]);

  // Leaving the page: save at once, and warn while there are answers the server doesn't have yet
  useEffect(() => {
    const hide = () => { if (document.visibilityState === 'hidden') saveDraft(true); };
    const h = (e) => {
      saveDraft(true);
      if (!submitted.current && JSON.stringify(answersRef.current) !== savedJson.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('beforeunload', h);
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('beforeunload', h); };
  }, [saveDraft]);

  /** Sends the answers. When the time is up it keeps trying, so a weak connection doesn't lose the attempt. */
  const submit = useCallback(async (force = false) => {
    if (submitted.current) return;
    const left = questions.length - questions.filter((q) => answersRef.current[q._id]?.length).length;
    if (!force && left > 0 && !window.confirm(`${left} question${left === 1 ? ' is' : 's are'} not answered. Submit anyway?`)) return;
    submitted.current = true;
    clearTimeout(saveTimer.current);
    setBusy(true);
    for (let i = 0; ; i++) {
      try {
        const res = await api.post(`/attempts/${attemptId}`, { answers: answersRef.current });
        if (res.message) flash(force ? 'info' : 'error', res.message);
        else if (force) flash('info', 'Time is up. Your quiz was submitted with the answers you had given.');
        navigate(`/attempts/${attemptId}/result`, { replace: true });
        return;
      } catch (e) {
        if (!force || (e.status && e.status < 500) || i >= 20) {
          submitted.current = false;
          setBusy(false);
          flash('error', e.message);
          return;
        }
        await wait(Math.min(2000 * (i + 1), 10000)); // no connection: try again
      }
    }
  }, [attemptId, questions, navigate, flash]);

  const expire = useCallback(() => {
    setTimeUp(true);
    submit(true);
  }, [submit]);

  const pick = (q, choiceId, checked) => {
    if (timeUp || submitted.current) return; // answers are locked once the time is up
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
      {timeUp && (
        <div className="flash flash-info quiz-timeup" role="alert">
          <Icon name="clock" /> <span><strong>Time is up.</strong> Your quiz is being submitted with the answers you have given{busy ? '…' : '.'}</span>
        </div>
      )}
      <form className="quiz-form" onSubmit={(e) => { e.preventDefault(); submit(false); }}>
        <fieldset className="quiz-fields" disabled={timeUp}>
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
        </fieldset>
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
    if (done && state.data.message) flash('info', state.data.message); // e.g. time ran out: closed with the saved answers
  }, [done, state.data, flash]);
  if (done) return <Navigate to={`/attempts/${id}/result`} replace />;

  return <Guard state={state}>{(data) => <QuizForm data={data} attemptId={id} />}</Guard>;
}
