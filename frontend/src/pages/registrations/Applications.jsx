import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { download, qs } from '../../lib/api.js';
import { useAuth, hasRole } from '../../lib/auth.jsx';
import { useFlash } from '../../lib/flash.jsx';
import { useApi, useTitle } from '../../lib/useApi.js';
import { fmtDate, plural, REG_STATUS, SOURCE_LABELS } from '../../lib/format.js';
import Icon from '../../components/Icon.jsx';
import { Badge, Guard } from '../../components/ui.jsx';

const TABS = [['', 'All'], ['pending', 'Pending'], ['correction_requested', 'Correction requested'], ['approved', 'Approved'], ['rejected', 'Rejected']];

/** Registration records: registrars (search, export), Department Heads (review queue), administrators. */
export default function Applications() {
  const { meta, user } = useAuth();
  const { flash } = useFlash();
  const [params, setParams] = useSearchParams();
  const f = {
    status: params.get('status') ?? (hasRole(user, 'department_head') ? 'pending' : ''),
    department: params.get('department') || '',
    source: params.get('source') || '',
    q: params.get('q') || '',
    page: params.get('page') || '',
  };
  const [search, setSearch] = useState(f.q);
  const state = useApi(`/registrations${qs(f)}`);
  const head = hasRole(user, 'department_head');
  useTitle(head ? 'Applications' : 'Student registrations', meta.appName);
  useEffect(() => setSearch(f.q), [f.q]);
  const apply = (next) => setParams(Object.fromEntries(Object.entries({ ...f, page: '', ...next }).filter(([, v]) => v !== '' && v != null)));

  const exportCsv = () => download(`/registrations/export${qs({ ...f, page: '' })}`, 'student-registrations.csv').catch((e) => flash('error', e.message));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{head ? 'Registration applications' : 'Student registrations'}</h1>
          <p className="muted">{head ? 'Review applications to your departments: approve, reject or ask for a correction.' : 'Create student accounts, check applications and track their review.'}</p>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-ghost" onClick={exportCsv}><Icon name="download" />Export CSV</button>
          {state.data?.canCreate && <Link className="btn btn-primary" to="/registrations/new"><Icon name="user-plus" />Register a student</Link>}
        </div>
      </div>
      <nav className="tabs" aria-label="Filter by status">
        {TABS.map(([k, label]) => (
          <Link key={k || 'all'} to={`/registrations${qs({ ...f, page: '', status: k || (head ? 'all' : '') })}`} aria-current={(f.status === k || (k === '' && f.status === 'all')) ? 'page' : undefined}>
            {label}{k && state.data?.counts?.[k] ? <span className="tab-count">{state.data.counts[k]}</span> : null}
          </Link>
        ))}
      </nav>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); apply({ q: search.trim() }); }}>
        <label className="search"><Icon name="search" /><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email, phone or student ID" aria-label="Search registrations" /></label>
        <select value={f.department} onChange={(e) => apply({ department: e.target.value })} aria-label="Department">
          <option value="">All my departments</option>
          {(state.data?.departments || []).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
        </select>
        <select value={f.source} onChange={(e) => apply({ source: e.target.value })} aria-label="How they registered">
          <option value="">Any source</option>
          {Object.entries(SOURCE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <button className="btn btn-ghost" type="submit">Search</button>
      </form>
      <Guard state={state}>
        {({ applications, total, page, pages }) => (
          <>
            <div className="card table-wrap">
              <table className="table">
                <thead><tr><th>Student</th><th>Department</th><th>Status</th><th>Submitted</th><th>Source</th><th /></tr></thead>
                <tbody>
                  {applications.map((a) => {
                    const [label, tone] = REG_STATUS[a.status] || [a.status, 'neutral'];
                    return (
                      <tr key={a._id}>
                        <td>
                          <Link to={`/registrations/${a._id}`}><strong>{a.name}</strong></Link><br />
                          <small className="muted">{a.email}{a.studentId ? ` · ${a.studentId}` : ''}</small>
                        </td>
                        <td className="small">{a.departmentName || '—'}</td>
                        <td>
                          <Badge tone={tone}>{label}</Badge>
                          {a.missing.length > 0 && a.status !== 'approved' && <><br /><small className="text-danger">Incomplete: {plural(a.missing.length, 'field')}</small></>}
                        </td>
                        <td className="small">{fmtDate(a.submittedAt)}</td>
                        <td className="small muted">{SOURCE_LABELS[a.source] || '—'}</td>
                        <td className="right nowrap">
                          <Link className="btn btn-ghost btn-sm" to={`/registrations/${a._id}`}>{head && a.status === 'pending' ? <><Icon name="check" />Review</> : <><Icon name="eye" />Open</>}</Link>
                        </td>
                      </tr>
                    );
                  })}
                  {!applications.length && <tr><td colSpan={6} className="muted center pad">No registrations match these filters.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <span className="muted small">{plural(total, 'registration')}</span>
              {pages > 1 && (
                <span className="actions">
                  <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => apply({ page: String(page - 1) })}><Icon name="arrow-left" />Previous</button>
                  <span className="small">Page {page} of {pages}</span>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => apply({ page: String(page + 1) })}>Next<Icon name="arrow-right" /></button>
                </span>
              )}
            </div>
          </>
        )}
      </Guard>
    </>
  );
}
