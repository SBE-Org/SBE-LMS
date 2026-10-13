import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import { useApi, useTitle } from '../../lib/useApi.js';
import Icon from '../../components/Icon.jsx';
import { EmptyState, Guard } from '../../components/ui.jsx';

export default function Teams() {
  const { meta } = useAuth();
  const state = useApi('/admin/teams');
  useTitle('Teams', meta.appName);
  return (
    <>
      <div className="page-head">
        <div><h1>Teams</h1><p className="muted">Group agents by campaign or floor. Assign courses to a whole team and give team leads their own reports.</p></div>
        <Link className="btn btn-primary" to="/admin/teams/new"><Icon name="plus" />New team</Link>
      </div>
      <Guard state={state}>
        {({ teams }) =>
          !teams.length ? (
            <EmptyState icon="team" title="No teams yet"><Link className="btn btn-primary" to="/admin/teams/new">Create a team</Link></EmptyState>
          ) : (
            <div className="card table-wrap">
              <table className="table">
                <thead><tr><th>Team</th><th>Team lead</th><th>People</th><th>Team courses</th><th /></tr></thead>
                <tbody>
                  {teams.map((t) => (
                    <tr key={t._id}>
                      <td><strong>{t.name}</strong>{t.campaign && <><br /><small className="muted">{t.campaign}</small></>}</td>
                      <td>{t.leadName || '—'}</td>
                      <td><Link to={`/admin/users?team=${t._id}`}>{t.members}</Link></td>
                      <td>{t.courses}</td>
                      <td className="right nowrap">
                        <Link className="btn btn-ghost btn-sm" to={`/reports?team=${t._id}`}><Icon name="chart" />Report</Link>{' '}
                        <Link className="btn btn-ghost btn-sm" to={`/admin/teams/${t._id}/edit`}><Icon name="edit" />Edit</Link>
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
