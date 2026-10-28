import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useFlash } from '../../lib/flash.jsx';
import { useApi, useTitle } from '../../lib/useApi.js';
import { fmtDate } from '../../lib/format.js';
import Icon from '../../components/Icon.jsx';
import { ActionButton, Badge, EmptyState, Guard } from '../../components/ui.jsx';

const TABS = [['pending', 'Waiting for authorization'], ['issued', 'Issued'], ['revoked', 'Revoked']];

/** Issuing authority: authorize certificates of courses that require it (Department Heads, administrators). */
export default function CertificateApprovals() {
  const { meta } = useAuth();
  const { flash } = useFlash();
  const [params] = useSearchParams();
  const status = params.get('status') || 'pending';
  const state = useApi(`/certificate-approvals${qs({ status })}`);
  useTitle('Certificate approvals', meta.appName);

  const act = (fn) => async () => {
    try {
      flash('success', (await fn()).message);
    } catch (e) {
      flash('error', e.message);
    }
    state.reload();
  };
  const revoke = (c) => async () => {
    const reason = window.prompt(`Why are you revoking certificate ${c.code}? (required)`);
    if (!reason) return;
    await act(() => api.post(`/certificate-approvals/${c._id}/revoke`, { reason }))();
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Certificate approvals</h1><p className="muted">Courses can require a Department Head or administrator to authorize certificates after the learner completes every requirement.</p></div>
      </div>
      <nav className="tabs" aria-label="Filter by status">
        {TABS.map(([k, label]) => <Link key={k} to={`/manage/certificates${qs({ status: k })}`} aria-current={status === k ? 'page' : undefined}>{label}</Link>)}
      </nav>
      <Guard state={state}>
        {({ certificates, canRevoke }) => !certificates.length ? (
          <EmptyState icon="award" title={status === 'pending' ? 'Nothing waiting' : 'No certificates here'}>
            <p className="muted">{status === 'pending' ? 'When a learner completes a course that requires authorization, their certificate appears here.' : 'Nothing to show.'}</p>
          </EmptyState>
        ) : (
          <div className="card table-wrap">
            <table className="table">
              <thead><tr><th>Learner</th><th>Course</th><th>Completed</th><th>Status</th><th /></tr></thead>
              <tbody>
                {certificates.map((c) => (
                  <tr key={c._id}>
                    <td><Link to={`/reports/users/${c.userId}`}><strong>{c.learnerName}</strong></Link><br /><small className="muted">{c.learnerEmail}{c.studentId ? ` · ${c.studentId}` : ''}</small></td>
                    <td className="small">{c.courseTitle}{c.departmentName && <><br /><span className="muted">{c.departmentName}</span></>}</td>
                    <td className="small">{fmtDate(c.completedAt || c.issuedAt)}</td>
                    <td>
                      <Badge tone={c.status === 'issued' ? 'success' : c.status === 'pending' ? 'warning' : 'danger'}>{c.status === 'issued' ? 'Issued' : c.status === 'pending' ? 'Pending' : 'Revoked'}</Badge>
                      {c.authorizedByName && <><br /><small className="muted">by {c.authorizedByName}</small></>}
                    </td>
                    <td className="right nowrap">
                      <Link className="btn btn-ghost btn-sm" to={`/certificates/${c.code}`}><Icon name="eye" />Preview</Link>{' '}
                      {c.status === 'pending' && (
                        <ActionButton className="btn btn-primary btn-sm" confirm={`Issue the certificate for ${c.courseTitle} to ${c.learnerName}?`} onAction={act(() => api.post(`/certificate-approvals/${c._id}/authorize`))}>
                          <Icon name="check" />Authorize
                        </ActionButton>
                      )}
                      {canRevoke && c.status === 'issued' && <button type="button" className="btn btn-ghost btn-sm danger" onClick={revoke(c)}>Revoke</button>}
                    </td>
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
