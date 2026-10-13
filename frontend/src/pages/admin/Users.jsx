import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { qs } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useApi, useTitle } from '../../lib/useApi.js';
import { fmtDateTime, initials, plural, ROLES } from '../../lib/format.js';
import Icon from '../../components/Icon.jsx';
import { Badge, Guard } from '../../components/ui.jsx';

export default function Users() {
  const { meta } = useAuth();
  const [params, setParams] = useSearchParams();
  const f = { q: params.get('q') || '', role: params.get('role') || '', team: params.get('team') || '', status: params.get('status') || 'active' };
  const [search, setSearch] = useState(f.q);
  const state = useApi(`/admin/users${qs(f)}`);
  useTitle('People', meta.appName);
  useEffect(() => setSearch(f.q), [f.q]);
  const apply = (next) => setParams(Object.fromEntries(Object.entries({ ...f, ...next }).filter(([, v]) => v)));

  return (
    <>
      <div className="page-head">
        <div><h1>People</h1><p className="muted">{state.data ? `${plural(state.data.users.length, 'person', 'people')} shown` : ' '}</p></div>
        <div className="actions">
          <Link className="btn btn-ghost" to="/admin/users/import"><Icon name="upload" />Import CSV</Link>
          <Link className="btn btn-primary" to="/admin/users/new"><Icon name="plus" />Add person</Link>
        </div>
      </div>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); apply({ q: search.trim() }); }}>
        <label className="search"><Icon name="search" /><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email or employee ID" aria-label="Search people" /></label>
        <select value={f.role} onChange={(e) => apply({ role: e.target.value })} aria-label="Role">
          <option value="">All roles</option>
          {Object.entries(ROLES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <select value={f.team} onChange={(e) => apply({ team: e.target.value })} aria-label="Team">
          <option value="">All teams</option>
          {(state.data?.teams || []).map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
        </select>
        <select value={f.status} onChange={(e) => apply({ status: e.target.value })} aria-label="Status">
          <option value="active">Active</option>
          <option value="inactive">Deactivated</option>
          <option value="all">Everyone</option>
        </select>
        <button className="btn btn-ghost" type="submit">Filter</button>
      </form>
      <Guard state={state}>
        {({ users }) => (
          <div className="card table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Role</th><th>Team</th><th>Courses</th><th>Last sign-in</th><th /></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u._id} className={u.active ? '' : 'is-muted'}>
                    <td>
                      <span className="person">
                        <span className="avatar avatar-sm">{initials(u.name)}</span>
                        <span><strong>{u.name}</strong><br /><small className="muted">{u.email}{u.employeeId ? ` · ${u.employeeId}` : ''}</small></span>
                      </span>
                    </td>
                    <td>{ROLES[u.role] || u.role}{!u.active && <> <Badge>Deactivated</Badge></>}</td>
                    <td className="small">{u.teamName || '—'}</td>
                    <td className="small">{u.completed}/{u.enrolments} done</td>
                    <td className="small muted">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'Never'}</td>
                    <td className="right nowrap">
                      <Link className="btn btn-ghost btn-sm" to={`/reports/users/${u._id}`}><Icon name="chart" />Progress</Link>{' '}
                      <Link className="btn btn-ghost btn-sm" to={`/admin/users/${u._id}/edit`}><Icon name="edit" />Edit</Link>
                    </td>
                  </tr>
                ))}
                {!users.length && <tr><td colSpan={6} className="muted center pad">Nobody matches these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Guard>
    </>
  );
}
