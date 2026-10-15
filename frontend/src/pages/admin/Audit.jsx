import { Link, useSearchParams } from 'react-router-dom';
import { qs } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useApi, useTitle } from '../../lib/useApi.js';
import { actionLabel, fmtDateTime, plural, ROLES } from '../../lib/format.js';
import Icon from '../../components/Icon.jsx';
import { Guard } from '../../components/ui.jsx';

/** Short, readable summary of an entry's details (never contains passwords). */
function detailText(d) {
  if (!d || typeof d !== 'object') return '';
  return Object.entries(d)
    .filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' · ');
}

export default function Audit() {
  const { meta } = useAuth();
  const [params, setParams] = useSearchParams();
  const f = { action: params.get('action') || '', target: params.get('target') || '', page: params.get('page') || '' };
  const state = useApi(`/admin/audit${qs(f)}`);
  useTitle('Audit log', meta.appName);
  const apply = (next) => setParams(Object.fromEntries(Object.entries({ ...f, page: '', ...next }).filter(([, v]) => v)));

  return (
    <>
      <div className="page-head">
        <div><h1>Audit log</h1><p className="muted">Account, permission, registration, certificate and settings actions — who did what, and when.</p></div>
      </div>
      <div className="toolbar">
        <select value={f.action} onChange={(e) => apply({ action: e.target.value })} aria-label="Action">
          <option value="">All actions</option>
          {['registration', 'user', 'certificate', 'settings', 'branding', 'department', 'course', 'enrolment'].map((g) => <option key={g} value={`${g}.`}>{actionLabel(g)} — all</option>)}
          {(state.data?.actions || []).map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
        </select>
        {f.target && <button type="button" className="btn btn-ghost btn-sm" onClick={() => apply({ target: '' })}><Icon name="x" />Clear record filter</button>}
      </div>
      <Guard state={state}>
        {({ entries, total, page, pages }) => (
          <>
            <div className="card table-wrap">
              <table className="table">
                <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e._id}>
                      <td className="small nowrap">{fmtDateTime(e.at)}</td>
                      <td className="small">{e.actorName || 'System'}{e.actorRole && <><br /><span className="muted">{ROLES[e.actorRole] || e.actorRole}</span></>}</td>
                      <td className="small"><code>{e.action}</code></td>
                      <td className="small">{e.targetId ? <Link to={`/admin/audit${qs({ target: e.targetId })}`}>{e.targetLabel || e.targetType}</Link> : e.targetLabel || '—'}</td>
                      <td className="small muted audit-details">{detailText(e.details)}</td>
                    </tr>
                  ))}
                  {!entries.length && <tr><td colSpan={5} className="muted center pad">No entries.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <span className="muted small">{plural(total, 'entry', 'entries')}</span>
              {pages > 1 && (
                <span className="actions">
                  <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => apply({ page: String(page - 1) })}><Icon name="arrow-left" />Newer</button>
                  <span className="small">Page {page} of {pages}</span>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => apply({ page: String(page + 1) })}>Older<Icon name="arrow-right" /></button>
                </span>
              )}
            </div>
          </>
        )}
      </Guard>
    </>
  );
}
