import { Link, useParams } from 'react-router-dom';
import { useAuth, hasRole } from '../../lib/auth.jsx';
import { useApi, useTitle } from '../../lib/useApi.js';
import { fmtDate, fmtDateTime, initials, ROLES } from '../../lib/format.js';
import Icon from '../../components/Icon.jsx';
import { Crumbs, EnrolmentBadge, Guard, ProgressBar, RegistrationBadge } from '../../components/ui.jsx';
import { PrintHeader, PrintButton } from './Overview.jsx';

export default function LearnerReport() {
  const { id } = useParams();
  const { user, meta } = useAuth();
  const state = useApi(`/reports/users/${id}`);
  useTitle(state.data?.person.name, meta.appName);

  return (
    <Guard state={state}>
      {({ person, enrolments, attempts, certificates }) => (
        <>
          <PrintHeader title={`Learner report · ${person.name}`} />
          <Crumbs items={[['Reports', '/reports'], [person.name]]} />
          <div className="page-head">
            <div className="person person-lg">
              <span className="avatar avatar-lg">{initials(person.name)}</span>
              <div>
                <h1>{person.name}</h1>
                <p className="muted">
                  {ROLES[person.role] || person.role}{person.departmentName ? ` · ${person.departmentName}` : ''} · {person.teamName || 'No team'}{person.employeeId ? ` · ${person.employeeId}` : ''} · last sign-in {person.lastLoginAt ? fmtDateTime(person.lastLoginAt) : 'never'}
                </p>
                {person.registrationStatus && <p><RegistrationBadge status={person.registrationStatus} /></p>}
              </div>
            </div>
            <PrintButton />
            {hasRole(user, 'admin') && <Link className="btn btn-ghost" to={`/admin/users/${person._id}/edit`}><Icon name="edit" />Edit person</Link>}
          </div>

          <section className="section">
            <h2>Courses</h2>
            <div className="card table-wrap">
              <table className="table">
                <thead><tr><th>Course</th><th>Progress</th><th className="num">Avg score</th><th>Status</th><th>Enrolled</th><th>Due</th><th>Completed</th></tr></thead>
                <tbody>
                  {enrolments.map((e) => {
                    const pct = e.completedAt ? 100 : e.p.pct;
                    return (
                      <tr key={e._id}>
                        <td><Link to={`/reports/courses/${e.courseId}`}>{e.title}</Link></td>
                        <td className="w-progress"><ProgressBar pct={pct} /><small className="muted">{pct}%</small></td>
                        <td className="num">{e.p.avgScore !== null ? `${e.p.avgScore}%` : '—'}</td>
                        <td><EnrolmentBadge completedAt={e.completedAt} dueDate={e.dueDate} pct={pct} /></td>
                        <td className="small">{fmtDate(e.enrolledAt)}</td>
                        <td className={`small ${e.overdue ? 'text-danger' : ''}`}>{fmtDate(e.dueDate)}</td>
                        <td className="small">{fmtDate(e.completedAt)}</td>
                      </tr>
                    );
                  })}
                  {!enrolments.length && <tr><td colSpan={7} className="muted center pad">Not enrolled in any course.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="section two-col">
            <div>
              <h2>Quiz attempts</h2>
              <div className="card list">
                {attempts.map((a) => (
                  <Link key={a._id} className="list-row" to={`/attempts/${a._id}/result`}>
                    <span className={`list-icon ${a.passed ? 'done' : 'fail'}`}><Icon name={a.passed ? 'check' : 'x'} /></span>
                    <span className="list-main"><strong>{a.quizTitle} — {a.percent}%</strong><small className="muted">{a.courseTitle} · {fmtDateTime(a.submittedAt)}</small></span>
                  </Link>
                ))}
                {!attempts.length && <p className="muted pad">No quiz attempts yet.</p>}
              </div>
            </div>
            <div>
              <h2>Certificates</h2>
              <div className="card list">
                {certificates.map((c) => (
                  <Link key={c._id} className="list-row" to={`/certificates/${c.code}`}>
                    <span className="list-icon award"><Icon name="award" /></span>
                    <span className="list-main"><strong>{c.title}</strong><small className="muted">{fmtDate(c.issuedAt)} · {c.code}</small></span>
                  </Link>
                ))}
                {!certificates.length && <p className="muted pad">No certificates yet.</p>}
              </div>
            </div>
          </section>
        </>
      )}
    </Guard>
  );
}
