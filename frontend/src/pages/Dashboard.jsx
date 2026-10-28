import { Link } from 'react-router-dom';
import { useAuth, hasRole } from '../lib/auth.jsx';
import { useApi, useTitle } from '../lib/useApi.js';
import { actionLabel, fmtDate, fmtDateTime, plural, REG_STATUS } from '../lib/format.js';
import Icon from '../components/Icon.jsx';
import Logo from '../components/Logo.jsx';
import { Badge, EmptyState, EnrolmentBadge, Guard, ProgressBar } from '../components/ui.jsx';

const nextLink = (n) => `${n.type === 'quiz' ? '/quizzes/' : '/lessons/'}${n.id}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DASHBOARD_LOGO = { admin: 'dashboardAdmin', department_head: 'dashboardDepartmentHead', registrar: 'dashboardRegistrar', agent: 'dashboardStudent' };

const Stat = ({ label, value, sub, alert, to }) => {
  const body = (<><span className="stat-label">{label}</span><span className="stat-value">{value}</span>{sub && <span className="stat-sub">{sub}</span>}</>);
  return to ? <Link className={`stat stat-link ${alert ? 'stat-alert' : ''}`} to={to}>{body}</Link> : <div className={`stat ${alert ? 'stat-alert' : ''}`}>{body}</div>;
};

function AppList({ rows, empty }) {
  return (
    <div className="card list">
      {!rows.length && <p className="muted pad">{empty}</p>}
      {rows.map((a) => {
        const [label, tone] = REG_STATUS[a.status] || [a.status, 'neutral'];
        return (
          <Link key={a._id} className="list-row" to={`/registrations/${a._id}`}>
            <span className="list-icon"><Icon name="clipboard" /></span>
            <span className="list-main"><strong>{a.name}</strong><small className="muted">{a.departmentName || '—'} · {fmtDate(a.submittedAt)}{a.missing?.length ? ` · missing ${a.missing.length}` : ''}</small></span>
            <Badge tone={tone}>{label}</Badge>
          </Link>
        );
      })}
    </div>
  );
}

/** Applications per month: submitted, approved, rejected (grouped bars, with a table for screen readers). */
function TrendChart({ trend }) {
  const max = Math.max(1, ...trend.flatMap((t) => [t.submitted, t.approved, t.rejected]));
  const series = [['submitted', 'Submitted', 'var(--brand)'], ['approved', 'Approved', 'var(--success)'], ['rejected', 'Rejected', 'var(--danger)']];
  const month = (m) => MONTHS[Number(m.slice(5, 7)) - 1];
  return (
    <div className="card trend">
      <div className="trend-legend small" aria-hidden="true">
        {series.map(([k, label, color]) => <span key={k}><i style={{ background: color }} />{label}</span>)}
      </div>
      <div className="trend-plot" aria-hidden="true">
        {trend.map((t) => (
          <div key={t.month} className="trend-group">
            <div className="trend-bars">
              {series.map(([k, label, color]) => (
                <span key={k} className="trend-bar" style={{ height: `${(t[k] / max) * 100}%`, background: color }} title={`${month(t.month)} · ${label}: ${t[k]}`} />
              ))}
            </div>
            <small className="muted">{month(t.month)}</small>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>Registrations per month</caption>
        <thead><tr><th>Month</th>{series.map(([k, label]) => <th key={k}>{label}</th>)}</tr></thead>
        <tbody>{trend.map((t) => <tr key={t.month}><td>{t.month}</td>{series.map(([k]) => <td key={k}>{t[k]}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function AdminPanel({ admin }) {
  const t = admin.totals;
  return (
    <>
      <section className="section">
        <div className="section-head"><h2>Institution at a glance</h2><Link to="/registrations?status=pending">Applications <Icon name="arrow-right" /></Link></div>
        <div className="stats">
          <Stat label="Active students" value={t.students} />
          <Stat label="Pending registrations" value={t.pending} sub={`${t.correction_requested} awaiting correction`} alert={t.pending > 0} to="/registrations?status=pending" />
          <Stat label="Departments" value={t.departments} sub={`${t.courses} published courses`} to="/admin/departments" />
          <Stat label="Certificates issued" value={t.certificates} sub={t.pendingCertificates ? `${t.pendingCertificates} waiting for authorization` : 'none waiting'} to="/manage/certificates" />
        </div>
      </section>
      <section className="section two-col">
        <div>
          <h2>Registration trend (6 months)</h2>
          <TrendChart trend={admin.trend} />
        </div>
        <div>
          <h2>Departments</h2>
          <div className="card table-wrap">
            <table className="table">
              <thead><tr><th>Department</th><th className="num">Students</th><th className="num">Pending</th><th className="num">Courses</th></tr></thead>
              <tbody>
                {admin.departments.map((d) => (
                  <tr key={d._id} className={d.active ? '' : 'is-muted'}>
                    <td>{d.name}</td><td className="num">{d.students}</td>
                    <td className="num">{d.pending ? <Link to={`/registrations?department=${d._id}&status=pending`}>{d.pending}</Link> : 0}</td>
                    <td className="num">{d.courses}</td>
                  </tr>
                ))}
                {!admin.departments.length && <tr><td colSpan={4} className="muted pad"><Link to="/admin/departments/new">Create the first department</Link></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="section-head"><h2>Recent activity</h2><Link to="/admin/audit">Audit log <Icon name="arrow-right" /></Link></div>
        <div className="card list">
          {admin.recentAudit.map((a) => (
            <div key={a._id} className="list-row">
              <span className="list-icon"><Icon name="history" /></span>
              <span className="list-main"><strong>{actionLabel(a.action)}{a.targetLabel ? ` · ${a.targetLabel}` : ''}</strong><small className="muted">{a.actorName || 'System'} · {fmtDateTime(a.at)}</small></span>
            </div>
          ))}
          {!admin.recentAudit.length && <p className="muted pad">No activity recorded yet.</p>}
        </div>
      </section>
    </>
  );
}

function DepartmentHeadPanel({ d }) {
  return (
    <>
      <section className="section">
        <div className="section-head"><h2>{d.departments.map((x) => x.name).join(', ') || 'Your departments'}</h2><Link to="/reports">Department reports <Icon name="arrow-right" /></Link></div>
        <div className="stats">
          <Stat label="Pending applications" value={d.counts.pending} alert={d.counts.pending > 0} to="/registrations?status=pending" />
          <Stat label="Approved students" value={d.counts.approved} sub={`${d.counts.correction_requested} awaiting correction · ${d.counts.rejected} rejected`} />
          <Stat label="Average quiz score" value={d.assessments.avgScore !== null ? `${d.assessments.avgScore}%` : '—'} sub={d.assessments.attempts ? `${d.assessments.passRate}% of ${d.assessments.attempts} attempts passed` : 'no attempts yet'} />
          <Stat label="Certificates to authorize" value={d.pendingCertificates} alert={d.pendingCertificates > 0} to="/manage/certificates" />
        </div>
      </section>
      <section className="section two-col">
        <div>
          <div className="section-head"><h2>Waiting for your review</h2><Link to="/registrations?status=pending">All <Icon name="arrow-right" /></Link></div>
          <AppList rows={d.pending} empty="No applications waiting. 🎉" />
        </div>
        <div>
          <div className="section-head"><h2>Department courses</h2><Link to="/manage/courses">Manage <Icon name="arrow-right" /></Link></div>
          <div className="card list">
            {!d.courses.length && <p className="muted pad">No courses yet. <Link to="/manage/courses/new">Create one</Link>.</p>}
            {d.courses.map((c) => {
              const pct = c.enrolled ? Math.round((c.completed * 100) / c.enrolled) : 0;
              return (
                <Link key={c._id} className="list-row" to={`/reports/courses/${c._id}`}>
                  <span className="list-icon"><Icon name="book" /></span>
                  <span className="list-main"><strong>{c.title}</strong><small className="muted">{c.enrolled} enrolled · {c.completed} completed</small><ProgressBar pct={pct} label={`${pct}% completed`} /></span>
                  {c.status !== 'published' && <Badge tone="warning">{c.status}</Badge>}
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}

function RegistrarPanel({ r }) {
  return (
    <>
      <section className="section">
        <div className="section-head"><h2>Registrations</h2><Link to="/registrations/new"><Icon name="user-plus" /> Register a student</Link></div>
        <div className="stats">
          <Stat label="New accounts (30 days)" value={r.createdLast30Days} />
          <Stat label="Pending departmental review" value={r.counts.pending} to="/registrations?status=pending" />
          <Stat label="Incomplete / correction requested" value={r.incompleteCount} alert={r.incompleteCount > 0} to="/registrations?status=correction_requested" />
          <Stat label="Approved · Rejected" value={`${r.counts.approved} · ${r.counts.rejected}`} to="/registrations?status=approved" />
        </div>
        {r.canApprove && <p className="small muted">An administrator has allowed you to approve registrations.</p>}
      </section>
      <section className="section two-col">
        <div><div className="section-head"><h2>Needs attention</h2></div><AppList rows={r.incomplete} empty="No incomplete applications." /></div>
        <div><div className="section-head"><h2>Recently created</h2><Link to="/registrations">All records <Icon name="arrow-right" /></Link></div><AppList rows={r.recent} empty="No accounts created in the last 30 days." /></div>
      </section>
    </>
  );
}

function StudentPanel({ s }) {
  const reg = s.registration;
  const [label, tone] = REG_STATUS[reg.status] || ['—', 'neutral'];
  return (
    <>
      {reg.status !== 'approved' ? (
        <section className={`reg-status card reg-${reg.status}`}>
          <div className="reg-status-main">
            <p className="eyebrow">Your registration{reg.departmentName ? ` · ${reg.departmentName}` : ''}</p>
            <Badge tone={tone}>{label}</Badge>
            <p>{s.blocked?.message}</p>
            {reg.reason && <div className="feedback"><strong>{reg.status === 'rejected' ? 'Reason' : 'Feedback'}:</strong> {reg.reason}</div>}
          </div>
          <Link className="btn btn-primary" to="/registration">{reg.status === 'correction_requested' ? 'Correct my registration' : 'View my registration'}</Link>
        </section>
      ) : (
        <p className="small muted reg-ok"><Badge tone="success">Registration approved</Badge>{reg.studentId && <> Student ID <strong>{reg.studentId}</strong></>}{reg.departmentName && <> · {reg.departmentName}</>}</p>
      )}
      {(s.deadlines.length > 0 || s.recentResults.length > 0) && (
        <section className="section two-col">
          <div>
            <h2>Upcoming deadlines</h2>
            <div className="card list">
              {!s.deadlines.length && <p className="muted pad">Nothing due in the next two weeks.</p>}
              {s.deadlines.map((d) => (
                <Link key={d.courseId} className="list-row" to={`/courses/${d.courseId}`}>
                  <span className={`list-icon ${d.overdue ? 'fail' : ''}`}><Icon name="clock" /></span>
                  <span className="list-main"><strong>{d.title}</strong><small className={d.overdue ? 'text-danger' : 'muted'}>{d.overdue ? 'Overdue since' : 'Due'} {fmtDate(d.dueDate)}</small></span>
                </Link>
              ))}
            </div>
          </div>
          <div>
            <h2>Recent results</h2>
            <div className="card list">
              {!s.recentResults.length && <p className="muted pad">No quiz results yet.</p>}
              {s.recentResults.map((a) => (
                <Link key={a._id} className="list-row" to={`/attempts/${a._id}/result`}>
                  <span className={`list-icon ${a.passed ? 'done' : 'fail'}`}><Icon name={a.passed ? 'check' : 'x'} /></span>
                  <span className="list-main"><strong>{a.quizTitle}</strong><small className="muted">{a.courseTitle} · {fmtDate(a.submittedAt)}</small></span>
                  <strong>{a.percent}%</strong>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
      {s.pendingCertificates > 0 && <div className="flash flash-info">{plural(s.pendingCertificates, 'certificate is', 'certificates are')} waiting for authorization by your department.</div>}
    </>
  );
}

export default function Dashboard() {
  const { user, meta } = useAuth();
  const state = useApi('/dashboard');
  useTitle('Dashboard', meta.appName);

  return (
    <Guard state={state}>
      {({ active, completed, resume, certificates, snapshot, student, admin, departmentHead, registrar }) => {
        const first = user.name.split(' ')[0];
        const hour = new Date().getHours();
        const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
        const overdue = active.filter((e) => e.overdue).length;
        const blocked = !!student?.blocked;
        const logoPlacement = DASHBOARD_LOGO[user.role];
        return (
          <>
            {logoPlacement && <Logo placement={logoPlacement} className="dash-logo" nameFallback={false} />}
            <div className="page-head">
              <div>
                <h1>{greet}, {first}</h1>
                <p className="muted">
                  {blocked ? 'Welcome! Your learning opens once your registration is approved.' : (
                    <>
                      {active.length ? `${plural(active.length, 'course')} in progress` : 'You have no courses in progress'}
                      {overdue > 0 && <> · <span className="text-danger">{plural(overdue, 'overdue course')}</span></>}
                    </>
                  )}
                </p>
              </div>
              {!blocked && <Link className="btn btn-ghost" to="/courses"><Icon name="book" />Browse courses</Link>}
            </div>

            {student && <StudentPanel s={student} />}
            {admin && <AdminPanel admin={admin} />}
            {departmentHead && <DepartmentHeadPanel d={departmentHead} />}
            {registrar && <RegistrarPanel r={registrar} />}

            {snapshot && (
              <section className="section">
                <div className="section-head">
                  <h2>{hasRole(user, 'team_lead') ? 'Your teams at a glance' : hasRole(user, 'department_head') ? 'Learning in your departments' : 'Training at a glance'}</h2>
                  <Link to="/reports">Full reports <Icon name="arrow-right" /></Link>
                </div>
                <div className="stats">
                  <div className="stat"><span className="stat-label">Active learners</span><span className="stat-value">{snapshot.learners}</span></div>
                  <div className="stat"><span className="stat-label">Completion rate</span><span className="stat-value">{snapshot.completionRate}%</span><span className="stat-sub">{snapshot.completed} of {snapshot.enrolments} enrollments</span></div>
                  <div className="stat"><span className="stat-label">Average quiz score</span><span className="stat-value">{snapshot.avgScore !== null ? `${snapshot.avgScore}%` : '—'}</span></div>
                  <div className={`stat ${snapshot.overdue ? 'stat-alert' : ''}`}><span className="stat-label">Overdue</span><span className="stat-value">{snapshot.overdue}</span><span className="stat-sub">enrollments past due date</span></div>
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

            {!blocked && !hasRole(user, 'registrar') && (
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
            )}

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
