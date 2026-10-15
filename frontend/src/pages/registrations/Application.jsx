import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, openProtectedFile, protectedImageUrl } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useFlash } from '../../lib/flash.jsx';
import { useApi, useTitle } from '../../lib/useApi.js';
import { fmtDate, fmtDateTime, fmtBytes, initials, REG_STATUS, SOURCE_LABELS, ROLES, ACCOUNT_STATUS } from '../../lib/format.js';
import Icon from '../../components/Icon.jsx';
import { Badge, Crumbs, Errors, Guard } from '../../components/ui.jsx';

const ACTION_LABELS = {
  submitted: 'Application submitted',
  created_by_staff: 'Account created by staff',
  resubmitted: 'Corrected and resubmitted',
  updated: 'Application updated',
  edited: 'Details edited',
  approved: 'Approved',
  rejected: 'Rejected',
  correction_requested: 'Correction requested',
  migrated: 'Carried over as approved',
};

/** Timeline of everything that happened to an application (also shown to the student). */
export function RegistrationHistory({ history }) {
  if (!history?.length) return <div className="card"><p className="muted pad">No history yet.</p></div>;
  return (
    <ol className="timeline card">
      {[...history].reverse().map((h, i) => {
        const tone = REG_STATUS[h.status]?.[1] || 'neutral';
        return (
          <li key={i} className={`timeline-item tone-${tone}`}>
            <strong>{ACTION_LABELS[h.action] || REG_STATUS[h.status]?.[0] || h.action}</strong>
            {h.override && <> <Badge tone="danger">Administrator override</Badge></>}
            <small className="muted">{fmtDateTime(h.at)}{h.byName ? ` · ${h.byName}${h.byRole ? ` (${ROLES[h.byRole] || h.byRole})` : ''}` : ''}</small>
            {h.reason && <p className="small">{h.reason}</p>}
          </li>
        );
      })}
    </ol>
  );
}

const FIELD_LABELS = {
  department: 'Department', phone: 'Phone', program: 'Program', trainingCategory: 'Training category', dateOfBirth: 'Date of birth',
  gender: 'Gender', address: 'Address', educationLevel: 'Education level', qualifications: 'Qualifications', emergencyContact: 'Emergency contact',
  photo: 'Photograph', documents: 'Supporting documents',
};

function Photo({ url, name }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    let made = null;
    if (url) protectedImageUrl(url).then((u) => { made = u; if (alive) setSrc(u); }).catch(() => {});
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [url]);
  return src ? <img className="avatar avatar-lg avatar-photo" src={src} alt={`Photograph of ${name}`} /> : <span className="avatar avatar-lg">{initials(name)}</span>;
}

/** Approve / reject / request correction. The server re-checks every rule. */
function DecisionPanel({ app, needsOverride, onDone }) {
  const { flash } = useFlash();
  const [decision, setDecision] = useState('approve');
  const [reason, setReason] = useState('');
  const [override, setOverride] = useState(false);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const needsReason = decision !== 'approve' || needsOverride;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    try {
      const res = await api.post(`/registrations/${app._id}/decision`, { decision, reason, override });
      flash('success', res.message);
      setReason('');
      setOverride(false);
      onDone();
    } catch (err) {
      setErrors(err.errors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card form decision">
      <h2>Decision</h2>
      <Errors errors={errors} />
      {needsOverride && (
        <div className="flash flash-info" role="note">
          Registration decisions belong to the Department Head. As an administrator you can <strong>override</strong>; the override and your reason are recorded in the audit log.
        </div>
      )}
      <div className="segmented" role="radiogroup" aria-label="Decision">
        {[['approve', 'Approve', 'check'], ['correction', 'Request correction', 'edit'], ['reject', 'Reject', 'x']].map(([k, label, icon]) => (
          <label key={k} className={`seg seg-${k} ${decision === k ? 'is-on' : ''}`}>
            <input type="radio" name="decision" value={k} checked={decision === k} onChange={() => setDecision(k)} />
            <Icon name={icon} />{label}
          </label>
        ))}
      </div>
      <label className="field">
        <span>
          {decision === 'reject' ? 'Reason for rejection' : decision === 'correction' ? 'What should the student correct or add?' : 'Note (optional)'}
          {needsReason && <span className="req"> *</span>}
          <small className="muted"> — the student will see this</small>
        </span>
        <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required={needsReason} minLength={needsReason ? 5 : undefined} maxLength={2000} />
      </label>
      {needsOverride && (
        <label className="check"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} required /> <span>I confirm this is an administrator override.</span></label>
      )}
      <div className="actions">
        <button className={`btn ${decision === 'reject' ? 'btn-danger' : 'btn-primary'}`} type="submit" disabled={busy}>
          {busy ? 'Saving…' : decision === 'approve' ? 'Approve registration' : decision === 'reject' ? 'Reject registration' : 'Send correction request'}
        </button>
      </div>
    </form>
  );
}

export default function Application() {
  const { id } = useParams();
  const { meta } = useAuth();
  const { flash } = useFlash();
  const state = useApi(`/registrations/${id}`);
  useTitle(state.data ? state.data.application.name : 'Application', meta.appName);

  const removeDoc = async (doc) => {
    if (!window.confirm(`Remove ${doc.name}?`)) return;
    try {
      flash('success', (await api.del(`/registrations/${id}/documents/${doc._id}`)).message);
    } catch (e) {
      flash('error', e.message);
    }
    state.reload();
  };

  return (
    <Guard state={state}>
      {({ application: a, canDecide, decisionNeedsOverride, decisionBlockedReason, canEdit }) => {
        const st = a.registration.status;
        const [label, tone] = REG_STATUS[st] || [st, 'neutral'];
        const p = a.profile || {};
        const facts = [
          ['Email', a.email], ['Phone', a.phone], ['Student ID', a.studentId || 'Assigned on approval'], ['Department', a.departmentName],
          ['Program', p.program], ['Training category', p.trainingCategory], ['Date of birth', p.dateOfBirth ? fmtDate(p.dateOfBirth) : null],
          ['Gender', p.gender ? p.gender.replace(/_/g, ' ') : null], ['Address', p.address], ['Education', p.educationLevel], ['Qualifications', p.qualifications],
          ['Emergency contact', p.emergencyContactName ? `${p.emergencyContactName}${p.emergencyContactPhone ? ` · ${p.emergencyContactPhone}` : ''}` : null],
        ].filter(([, v]) => v);
        const acc = ACCOUNT_STATUS[a.accountStatus] || ACCOUNT_STATUS.active;
        return (
          <>
            <Crumbs items={[['Registrations', '/registrations'], [a.name]]} />
            <div className="page-head">
              <div className="person person-lg">
                <Photo url={a.photoUrl} name={a.name} />
                <div>
                  <h1>{a.name}</h1>
                  <p className="muted"><Badge tone={tone}>{label}</Badge> <Badge tone={acc[1]}>Account: {acc[0]}</Badge> · {SOURCE_LABELS[a.registration.source] || ''}{a.registration.createdByName ? ` by ${a.registration.createdByName}` : ''}</p>
                </div>
              </div>
              {canEdit && <Link className="btn btn-ghost" to={`/registrations/${a._id}/edit`}><Icon name="edit" />Edit details</Link>}
            </div>

            {a.missing.length > 0 && st !== 'approved' && (
              <div className="flash flash-error" role="note">Incomplete: {a.missing.map((m) => FIELD_LABELS[m] || m).join(', ')}.</div>
            )}
            {a.registration.reason && st !== 'pending' && (
              <div className={`flash ${st === 'rejected' ? 'flash-error' : 'flash-info'}`}><strong>{st === 'approved' ? 'Note' : st === 'rejected' ? 'Reason' : 'Correction requested'}:</strong>&nbsp;{a.registration.reason}</div>
            )}

            <div className="app-layout">
              <div>
                <section className="card pad-lg">
                  <h2>Application</h2>
                  <dl className="facts-list">
                    {facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                    <div><dt>Submitted</dt><dd>{fmtDateTime(a.registration.submittedAt)}</dd></div>
                    {a.registration.reviewedAt && <div><dt>Reviewed</dt><dd>{fmtDateTime(a.registration.reviewedAt)}{a.registration.reviewedByName ? ` by ${a.registration.reviewedByName}` : ''}</dd></div>}
                    <div><dt>Terms accepted</dt><dd>{a.registration.termsAcceptedAt ? fmtDateTime(a.registration.termsAcceptedAt) : '—'}</dd></div>
                  </dl>
                </section>

                <section className="section">
                  <h2>Supporting documents</h2>
                  <div className="card list">
                    {!a.registration.documents.length && <p className="muted pad">No documents uploaded.</p>}
                    {a.registration.documents.map((d) => (
                      <div key={d._id} className="list-row">
                        <span className="list-icon"><Icon name="file" /></span>
                        <span className="list-main"><strong>{d.label || d.name}</strong><small className="muted">{d.name} · {fmtBytes(d.size)} · uploaded {fmtDateTime(d.uploadedAt)}</small></span>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openProtectedFile(d.url).catch((e) => flash('error', e.message))}><Icon name="eye" />Open</button>
                        <button type="button" className="icon-btn" aria-label={`Download ${d.name}`} title="Download" onClick={() => openProtectedFile(`${d.url}?download=1`, { download: true, name: d.name }).catch((e) => flash('error', e.message))}><Icon name="download" /></button>
                        {canEdit && st !== 'approved' && <button type="button" className="icon-btn danger" aria-label={`Remove ${d.name}`} onClick={() => removeDoc(d)}><Icon name="trash" /></button>}
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div>
                {canDecide ? (
                  <DecisionPanel app={a} needsOverride={decisionNeedsOverride} onDone={state.reload} />
                ) : (
                  <div className="card pad-lg"><h2>Decision</h2><p className="muted small">{decisionBlockedReason}</p></div>
                )}
                <section className="section">
                  <h2>History</h2>
                  <RegistrationHistory history={a.registration.history} />
                </section>
              </div>
            </div>
          </>
        );
      }}
    </Guard>
  );
}
