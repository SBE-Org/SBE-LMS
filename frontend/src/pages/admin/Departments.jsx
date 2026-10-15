import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import { useApi, useTitle } from '../../lib/useApi.js';
import Icon from '../../components/Icon.jsx';
import { Badge, EmptyState, Guard } from '../../components/ui.jsx';

export default function Departments() {
  const { meta } = useAuth();
  const state = useApi('/admin/departments');
  useTitle('Departments', meta.appName);
  return (
    <>
      <div className="page-head">
        <div><h1>Departments</h1><p className="muted">Students apply to a department; its Department Head reviews them and manages its courses. Assign heads and registrars on the People page.</p></div>
        <Link className="btn btn-primary" to="/admin/departments/new"><Icon name="plus" />New department</Link>
      </div>
      <Guard state={state}>
        {({ departments }) => !departments.length ? (
          <EmptyState icon="building" title="No departments yet">
            <p className="muted">Create departments so students can register and Department Heads can review them.</p>
            <Link className="btn btn-primary" to="/admin/departments/new">New department</Link>
          </EmptyState>
        ) : (
          <div className="card table-wrap">
            <table className="table">
              <thead><tr><th>Department</th><th>Department Head</th><th className="num">Students</th><th className="num">Pending</th><th className="num">Courses</th><th /></tr></thead>
              <tbody>
                {departments.map((d) => (
                  <tr key={d._id} className={d.active ? '' : 'is-muted'}>
                    <td><strong>{d.name}</strong> <code className="small">{d.code}</code>{!d.active && <> <Badge>Inactive</Badge></>}<br /><small className="muted">{d.programs.length ? d.programs.join(', ') : 'No programs listed'}</small></td>
                    <td className="small">{d.heads.length ? d.heads.map((h) => h.name).join(', ') : <span className="text-danger">None assigned</span>}{d.registrars.length > 0 && <><br /><span className="muted">Registrar: {d.registrars.map((h) => h.name).join(', ')}</span></>}</td>
                    <td className="num">{d.students}</td>
                    <td className="num">{d.pending ? <Link to={`/registrations?department=${d._id}&status=pending`}>{d.pending}</Link> : 0}</td>
                    <td className="num">{d.courses}</td>
                    <td className="right"><Link className="btn btn-ghost btn-sm" to={`/admin/departments/${d._id}/edit`}><Icon name="edit" />Edit</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Guard>
    </>
  );
}
