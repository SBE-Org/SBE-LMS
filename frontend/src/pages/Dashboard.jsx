import { Link } from 'react-router-dom';
import { useAuth, hasRole } from '../lib/auth.jsx';
import { useApi, useTitle } from '../lib/useApi.js';
import { fmtDate, plural } from '../lib/format.js';
import Icon from '../components/Icon.jsx';
import { EmptyState, EnrolmentBadge, Guard, ProgressBar } from '../components/ui.jsx';

const nextLink = (n) => `${n.type === 'quiz' ? '/quizzes/' : '/lessons/'}${n.id}`;

export default function Dashboard() {
  const { user, meta } = useAuth();
  const state = useApi('/dashboard');
  useTitle('Dashboard', meta.appName);

  return (
    <Guard state={state}>
      {({ active, completed, resume, certificates, snapshot }) => {
        const first = user.name.split(' ')[0];
        const hour = new Date().getHours();
        const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
        const overdue = active.filter((e) => e.overdue).length;
        return (
          <>
            <div className="page-head">
              <div>
                <h1>{greet}, {first}</h1>
                <p className="muted">
                  {active.length ? `${plural(active.length, 'course')} in progress` : 'You have no courses in progress'}
                  {overdue > 0 && <> · <span className="text-danger">{plural(overdue, 'overdue course')}</span></>}
                </p>
              </div>
              <Link className="btn btn-ghost" to="/courses"><Icon name="book" />Browse courses</Link>
            </div>

            {snapshot && (
              <section className="section">
                <div className="section-head">
                  <h2>{hasRole(user, 'team_lead') ? 'Your teams at a glance' : 'Training at a glance'}</h2>
                  <Link to="/reports">Full reports <Icon name="arrow-right" /></Link>
                </div>
                <div className="stats">
                  <div className="stat"><span className="stat-label">Active learners</span><span className="stat-value">{snapshot.learners}</span></div>
                  <div className="stat"><span className="stat-label">Completion rate</span><span className="stat-value">{snapshot.completionRate}%</span><span className="stat-sub">{snapshot.completed} of {snapshot.enrolments} enrolments</span></div>
                  <div className="stat"><span className="stat-label">Average quiz score</span><span className="stat-value">{snapshot.avgScore !== null ? `${snapshot.avgScore}%` : '—'}</span></div>
                  <div className={`stat ${snapshot.overdue ? 'stat-alert' : ''}`}><span className="stat-label">Overdue</span><span className="stat-value">{snapshot.overdue}</span><span className="stat-sub">enrolments past due date</span></div>
                </div>
              </section>
            )}

            {resume && (
              <section className="resume card">
                <div>
                  <p className="eyebrow">Continue where you left off</p>
                  <h2>{resume.course.title}</h2>
                  <p className="muted">Next: <Icon name={resume.next.type === 'quiz' ? 'quiz' : 'text'} className="icon icon-inline" /> {resume.next.title}</p>
                  <ProgressBar pct={resume.course.progress.pct} />
                </div>
                <Link className="btn btn-primary" to={nextLink(resume.next)}>
                  {resume.course.progress.pct > 0 ? 'Continue' : 'Start'} <Icon name="arrow-right" />
                </Link>
              </section>
            )}

            <section className="section">
              <div className="section-head"><h2>My learning</h2></div>
              {!active.length && !completed.length ? (
                <EmptyState icon="book" title="No courses yet">
                  <p className="muted">When your trainer or team lead assigns you a course it will appear here. You can also join open courses yourself.</p>
                  <Link className="btn btn-primary" to="/courses">Browse courses</Link>
                </EmptyState>
              ) : !active.length ? (
                <div className="empty-state card">
                  <Icon name="check" className="icon icon-xl text-success" />
                  <h3>All caught up</h3>
                  <p className="muted">You have completed every course assigned to you.</p>
                </div>
              ) : (
                <div className="course-grid">
                  {active.map((e) => (
                    <Link key={e._id} className="course-card card" to={`/courses/${e.courseId}`}>
                      <div className="course-card-top">
                        <span className="chip">{e.category || 'General'}</span>
                        <EnrolmentBadge completedAt={e.completedAt} dueDate={e.dueDate} pct={e.progress.pct} />
                      </div>
                      <h3>{e.title}</h3>
                      <p className="muted clamp">{e.summary}</p>
                      <div className="course-card-foot">
                        <ProgressBar pct={e.progress.pct} />
                        <div className="row-between small muted">
                          <span>{e.progress.pct}% · {e.progress.done}/{e.progress.total} items</span>
                          {e.dueDate && <span className={e.overdue ? 'text-danger' : ''}>Due {fmtDate(e.dueDate)}</span>}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {(completed.length > 0 || certificates.length > 0) && (
              <section className="section two-col">
                <div>
                  <div className="section-head"><h2>Completed</h2></div>
                  <div className="card list">
                    {!completed.length && <p className="muted pad">Nothing completed yet.</p>}
                    {completed.map((e) => (
                      <Link key={e._id} className="list-row" to={`/courses/${e.courseId}`}>
                        <span className="list-icon done"><Icon name="check" /></span>
                        <span className="list-main"><strong>{e.title}</strong><small className="muted">Completed {fmtDate(e.completedAt)}</small></span>
                      </Link>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="section-head"><h2>Certificates</h2><Link to="/certificates">All <Icon name="arrow-right" /></Link></div>
                  <div className="card list">
                    {!certificates.length && <p className="muted pad">Finish a course to earn your first certificate.</p>}
                    {certificates.map((c) => (
                      <Link key={c._id} className="list-row" to={`/certificates/${c.code}`}>
                        <span className="list-icon award"><Icon name="award" /></span>
                        <span className="list-main"><strong>{c.title}</strong><small className="muted">{fmtDate(c.issuedAt)} · {c.code}</small></span>
                      </Link>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </>
        );
      }}
    </Guard>
  );
}
