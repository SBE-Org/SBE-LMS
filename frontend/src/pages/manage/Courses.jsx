import { Link, useSearchParams } from 'react-router-dom';
import { qs } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useApi, useTitle } from '../../lib/useApi.js';
import { capitalize, fmtDate, plural } from '../../lib/format.js';
import Icon from '../../components/Icon.jsx';
import { Badge, EmptyState, Guard, STATUS_TONE } from '../../components/ui.jsx';

const TABS = [['', 'All'], ['published', 'Published'], ['draft', 'Drafts'], ['archived', 'Archived']];

export default function ManageCourses() {
  const { meta } = useAuth();
  const [params] = useSearchParams();
  const status = params.get('status') || '';
  const state = useApi(`/manage/courses${qs({ status })}`);
  useTitle('Manage courses', meta.appName);

  return (
    <>
      <div className="page-head">
        <div><h1>Manage courses</h1><p className="muted">Build courses, add lessons and quizzes, and assign them to people and teams.</p></div>
        <Link className="btn btn-primary" to="/manage/courses/new"><Icon name="plus" />New course</Link>
      </div>
      <nav className="tabs" aria-label="Filter by status">
        {TABS.map(([k, label]) => (
          <Link key={k} to={`/manage/courses${qs({ status: k })}`} aria-current={status === k ? 'page' : undefined}>{label}</Link>
        ))}
      </nav>
      <Guard state={state}>
        {({ courses }) =>
          !courses.length ? (
            <EmptyState icon="book" title="No courses here">
              <p className="muted">Create your first course to get started.</p>
              <Link className="btn btn-primary" to="/manage/courses/new">New course</Link>
            </EmptyState>
          ) : (
            <div className="card table-wrap">
              <table className="table">
                <thead><tr><th>Course</th><th>Status</th><th>Content</th><th>Learners</th><th>Updated</th><th /></tr></thead>
                <tbody>
                  {courses.map((c) => (
                    <tr key={c._id}>
                      <td><Link to={`/manage/courses/${c._id}`}><strong>{c.title}</strong></Link><br /><small className="muted">{c.category || 'General'} · {c.departmentName || 'Institution-wide'}</small></td>
                      <td><Badge tone={STATUS_TONE[c.status]}>{capitalize(c.status)}</Badge></td>
                      <td className="small">{plural(c.lessonCount, 'lesson')}, {plural(c.quizCount, 'quiz', 'quizzes')}</td>
                      <td className="small">{c.enrolled} enrolled<br /><span className="muted">{c.completed} completed</span></td>
                      <td className="small muted">{fmtDate(c.updatedAt)}</td>
                      <td className="right nowrap">
                        <Link className="btn btn-ghost btn-sm" to={`/manage/courses/${c._id}/enrolments`}><Icon name="users" />Enroll</Link>{' '}
                        <Link className="btn btn-ghost btn-sm" to={`/manage/courses/${c._id}`}><Icon name="edit" />Build</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Guard>
    </>
  );
}
