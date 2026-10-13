import { Fragment, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useFlash } from '../lib/flash.jsx';
import { useApi, useTitle } from '../lib/useApi.js';
import { fmtDateTime, plural } from '../lib/format.js';
import Icon from '../components/Icon.jsx';
import { Badge, Crumbs, Guard } from '../components/ui.jsx';

/** Starts (or resumes) a quiz attempt and opens it. Used by the intro and result pages. */
export function useStartQuiz() {
  const navigate = useNavigate();
  const { flash } = useFlash();
  const [busy, setBusy] = useState(false);
  const start = async (quiz) => {
    if (quiz.timeLimitMin && !window.confirm(`The ${quiz.timeLimitMin}-minute timer starts as soon as you begin. Ready?`)) return;
    setBusy(true);
    try {
      const { attemptId } = await api.post(`/quizzes/${quiz._id}/start`);
      navigate(`/attempts/${attemptId}`);
    } catch (e) {
      flash('error', e.message);
      setBusy(false);
    }
  };
  return { start, busy };
}

export default function QuizIntro() {
  const { id } = useParams();
  const { meta } = useAuth();
  const state = useApi(`/quizzes/${id}`);
  const { start, busy } = useStartQuiz();
  useTitle(state.data?.quiz.title, meta.appName);

  return (
    <Guard state={state}>
      {({ quiz, course, enrolled, attempts, open, questionCount, remaining, passed, best }) => (
        <>
          <Crumbs items={[['Courses', '/courses'], [course.title, `/courses/${course._id}`], [quiz.title]]} />
          <div className="quiz-intro card narrow-wide">
            <p className="eyebrow">Assessment</p>
            <h1>{quiz.title}</h1>
            {quiz.description && <p className="lead">{quiz.description.split('\n').map((l, i) => <Fragment key={i}>{i > 0 && <br />}{l}</Fragment>)}</p>}
            <dl className="facts">
              <div><dt>Questions</dt><dd>{questionCount}</dd></div>
              <div><dt>Pass mark</dt><dd>{quiz.passMark}%</dd></div>
              <div><dt>Time limit</dt><dd>{quiz.timeLimitMin ? `${quiz.timeLimitMin} min` : 'None'}</dd></div>
              <div><dt>Attempts</dt><dd>{quiz.maxAttempts > 0 ? `${attempts.length} of ${quiz.maxAttempts} used` : 'Unlimited'}</dd></div>
            </dl>
            {passed && <div className="flash flash-success"><Icon name="check" className="icon icon-inline" /> You passed this quiz. Your best score is {best}%.</div>}
            <div className="actions">
              {!enrolled ? (
                <p className="muted">You need to be enrolled in this course to take the quiz.</p>
              ) : open ? (
                <Link className="btn btn-primary" to={`/attempts/${open._id}`}>Resume attempt <Icon name="arrow-right" /></Link>
              ) : questionCount === 0 ? (
                <p className="muted">This quiz has no questions yet.</p>
              ) : remaining === 0 ? (
                <p className="text-danger">You have used all your attempts. Contact your trainer if you need another try.</p>
              ) : (
                <>
                  <button className="btn btn-primary" type="button" disabled={busy} onClick={() => start(quiz)}>
                    {attempts.length ? 'Try again' : 'Start quiz'} <Icon name="arrow-right" />
                  </button>
                  {remaining !== null && <span className="small muted">{plural(remaining, 'attempt')} left</span>}
                </>
              )}
            </div>
          </div>

          {attempts.length > 0 && (
            <section className="section narrow-wide">
              <h2>Your attempts</h2>
              <div className="card table-wrap">
                <table className="table">
                  <thead><tr><th>Date</th><th>Score</th><th>Result</th><th /></tr></thead>
                  <tbody>
                    {attempts.map((a) => (
                      <tr key={a._id}>
                        <td>{fmtDateTime(a.submittedAt)}</td>
                        <td>{a.score}/{a.maxScore} ({a.percent}%)</td>
                        <td>{a.passed ? <Badge tone="success">Passed</Badge> : <Badge tone="danger">Not passed</Badge>}</td>
                        <td className="right"><Link to={`/attempts/${a._id}/result`}>Review</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </Guard>
  );
}
