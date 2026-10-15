import { Link, useParams, useSearchParams } from 'react-router-dom';
import { qs } from '../../lib/api.js';
import { useAuth, canBuild } from '../../lib/auth.jsx';
import { useApi, useTitle } from '../../lib/useApi.js';
import { fmtDate } from '../../lib/format.js';
import Icon from '../../components/Icon.jsx';
import { Crumbs, EnrolmentBadge, Guard, ProgressBar } from '../../components/ui.jsx';
import { TeamFilter, PrintHeader, PrintButton } from './Overview.jsx';

export default function CourseReport() {
  const { id } = useParams();
  const { user, meta } = useAuth();
  const [params, setParams] = useSearchParams();
  const team = params.get('team') || '';
  const state = useApi(`/reports/courses/${id}${qs({ team })}`);
  useTitle(state.data ? `Report: ${state.data.course.title}` : 'Report', meta.appName);

  return (
    <Guard state={state}>
      {({ course, totals, quizzes, enrolments, teamOptions, isTeamLead }) => {
        const done = enrolments.filter((e) => e.completedAt).length;
        const overdue = enrolments.filter((e) => e.overdue).length;
        return (
          <>
            <PrintHeader title={`Course report · ${course.title}`} />
            <Crumbs items={[['Reports', `/reports${qs({ team })}`], [course.title]]} />
            <div className="page-head">
              <div><h1>{course.title}</h1><p className="muted">{totals.lessons} lessons · {totals.quizzes} quizzes</p></div>
              <div className="actions no-print">
                <PrintButton />
                {canBuild(user) && <Link className="btn btn-ghost" to={`/manage/courses/${course._id}/enrolments`}><Icon name="users" />Manage enrolments</Link>}
              </div>
            </div>
            <TeamFilter options={teamOptions} team={team} isTeamLead={isTeamLead} onChange={(v) => setParams(v ? { team: v } : {})} />
            <div className="stats">
              <div className="stat"><span className="stat-label">Enrolled</span><span className="stat-value">{enrolments.length}</span></div>
              <div className="stat"><span className="stat-label">Completed</span><span className="stat-value">{done}</span><span className="stat-sub">{enrolments.length ? Math.round((done * 100) / enrolments.length) : 0}% completion</span></div>
              <div className={`stat ${overdue ? 'stat-alert' : ''}`}><span className="stat-label">Overdue</span><span className="stat-value">{overdue}</span></div>
            </div>

            {quizzes.length > 0 && (
              <section className="section">
                <h2>Quizzes</h2>
                <div className="card table-wrap">
                  <table className="table">
                    <thead><tr><th>Quiz</th><th className="num">Learners tried</th><th>Pass rate</th><th className="num">Avg score</th><th className="num">Attempts</th><th /></tr></thead>
                    <tbody>
                      {quizzes.map((q) => (
                        <tr key={q._id}>
                          <td><strong>{q.title}</strong><br /><small className="muted">pass mark {q.passMark}%</small></td>
                          <td className="num">{q.stats.learners}</td>
                          <td className="w-progress"><ProgressBar pct={q.stats.passRate} /><small className="muted">{q.stats.passRate}% ({q.stats.passed})</small></td>
                          <td className="num">{q.stats.avg !== null ? `${q.stats.avg}%` : '—'}</td>
                          <td className="num">{q.stats.attempts}</td>
                          <td className="right"><Link to={`/reports/quizzes/${q._id}${qs({ team })}`}>Question analysis</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section className="section">
              <h2>Learners</h2>
              <div className="card table-wrap">
                <table className="table">
                  <thead><tr><th>Learner</th><th>Team</th><th>Progress</th><th className="num">Lessons</th><th className="num">Quizzes passed</th><th className="num">Score</th><th>Status</th><th>Due</th></tr></thead>
                  <tbody>
                    {enrolments.map((e) => {
                      const pct = e.completedAt ? 100 : e.p.pct;
                      return (
                        <tr key={e._id}>
                          <td><Link to={`/reports/users/${e.userId}`}>{e.name}</Link>{e.employeeId && <><br /><small className="muted">{e.employeeId}</small></>}</td>
                          <td className="small">{e.teamName || '—'}</td>
                          <td className="w-progress"><ProgressBar pct={pct} /><small className="muted">{pct}%</small></td>
                          <td className="num">{e.p.lessonsDone}/{totals.lessons}</td>
                          <td className="num">{e.p.quizzesPassed}/{totals.quizzes}</td>
                          <td className="num">{e.p.avgScore !== null ? `${e.p.avgScore}%` : '—'}</td>
                          <td><EnrolmentBadge completedAt={e.completedAt} dueDate={e.dueDate} pct={pct} /></td>
                          <td className={`small ${e.overdue ? 'text-danger' : ''}`}>{fmtDate(e.dueDate)}</td>
                        </tr>
                      );
                    })}
                    {!enrolments.length && <tr><td colSpan={8} className="muted center pad">No learners enrolled in this view.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        );
      }}
    </Guard>
  );
}
