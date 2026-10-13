import { Link, useParams, useSearchParams } from 'react-router-dom';
import { qs } from '../../lib/api.js';
import { useAuth, isStaff } from '../../lib/auth.jsx';
import { useApi, useTitle } from '../../lib/useApi.js';
import { fmtDateTime, truncate } from '../../lib/format.js';
import Icon from '../../components/Icon.jsx';
import { Badge, Crumbs, Guard, ProgressBar } from '../../components/ui.jsx';

export default function QuizReport() {
  const { id } = useParams();
  const { user, meta } = useAuth();
  const [params] = useSearchParams();
  const team = params.get('team') || '';
  const state = useApi(`/reports/quizzes/${id}${qs({ team })}`);
  useTitle(state.data ? `Quiz report: ${state.data.quiz.title}` : 'Quiz report', meta.appName);

  return (
    <Guard state={state}>
      {({ quiz, course, stats, questions, attempts }) => (
        <>
          <Crumbs items={[['Reports', `/reports${qs({ team })}`], [course?.title, `/reports/courses/${quiz.course}${qs({ team })}`], [quiz.title]]} />
          <div className="page-head">
            <div><h1>{quiz.title}</h1><p className="muted">Pass mark {quiz.passMark}%</p></div>
            {isStaff(user) && <Link className="btn btn-ghost" to={`/manage/quizzes/${quiz._id}`}><Icon name="edit" />Edit questions</Link>}
          </div>
          <div className="stats">
            <div className="stat"><span className="stat-label">Learners tried</span><span className="stat-value">{stats.learners}</span><span className="stat-sub">{stats.attempts} attempts</span></div>
            <div className="stat"><span className="stat-label">Pass rate</span><span className="stat-value">{stats.passRate}%</span><span className="stat-sub">{stats.passed} passed</span></div>
            <div className="stat"><span className="stat-label">Average score</span><span className="stat-value">{stats.avg !== null ? `${stats.avg}%` : '—'}</span><span className="stat-sub">all attempts</span></div>
          </div>

          <section className="section">
            <div className="section-head"><h2>Question analysis</h2><span className="small muted">Questions most people get wrong may need better training material — or clearer wording.</span></div>
            <div className="card table-wrap">
              <table className="table">
                <thead><tr><th>#</th><th>Question</th><th className="num">Answered</th><th>Answered correctly</th></tr></thead>
                <tbody>
                  {questions.map((q, n) => (
                    <tr key={q._id}>
                      <td className="muted">{n + 1}</td>
                      <td>{truncate(q.body, 140)}</td>
                      <td className="num">{q.answered}</td>
                      <td className="w-progress">
                        {q.rate !== null ? (
                          <><ProgressBar pct={q.rate} /><small className={q.rate < 50 ? 'text-danger' : 'muted'}>{q.rate}%{q.rate < 50 ? ' — review this' : ''}</small></>
                        ) : <span className="muted">—</span>}
                      </td>
                    </tr>
                  ))}
                  {!questions.length && <tr><td colSpan={4} className="muted center pad">No data yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="section">
            <h2>Recent attempts</h2>
            <div className="card table-wrap">
              <table className="table">
                <thead><tr><th>Learner</th><th>Team</th><th>Submitted</th><th className="num">Score</th><th>Result</th><th /></tr></thead>
                <tbody>
                  {attempts.map((a) => (
                    <tr key={a._id}>
                      <td><Link to={`/reports/users/${a.userId}`}>{a.name}</Link></td>
                      <td className="small">{a.teamName || '—'}</td>
                      <td className="small">{fmtDateTime(a.submittedAt)}</td>
                      <td className="num">{a.percent}%</td>
                      <td>{a.passed ? <Badge tone="success">Passed</Badge> : <Badge tone="danger">Not passed</Badge>}</td>
                      <td className="right"><Link to={`/attempts/${a._id}/result`}>View answers</Link></td>
                    </tr>
                  ))}
                  {!attempts.length && <tr><td colSpan={6} className="muted center pad">No attempts yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </Guard>
  );
}
