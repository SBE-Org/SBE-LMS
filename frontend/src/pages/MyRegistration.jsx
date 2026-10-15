import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, openProtectedFile } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useFlash } from '../lib/flash.jsx';
import { useApi, useTitle } from '../lib/useApi.js';
import { fmtDate, fmtDateTime, fmtBytes, REG_STATUS } from '../lib/format.js';
import Icon from '../components/Icon.jsx';
import { ActionButton, Badge, Guard } from '../components/ui.jsx';
import RegistrationForm from '../components/RegistrationForm.jsx';
import { RegistrationHistory } from './registrations/Application.jsx';

const NEXT_STEP = {
  pending: 'Your application is with your department for review. You will get a notification when a decision is made.',
  correction_requested: 'Your department asked you to correct your application. Update the details below and submit it again.',
  approved: 'Your registration is approved. You can now open your courses.',
  rejected: 'Your registration was not approved. If you think this is a mistake, contact the registrar.',
};

/** The student's own application: status, feedback, documents and corrections. */
export default function MyRegistration() {
  const { meta, user, setUser } = useAuth();
  const { flash } = useFlash();
  const state = useApi('/registration/me');
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  useTitle('My registration', meta.appName);

  const save = async (fd) => {
    setBusy(true);
    setErrors([]);
    try {
      const res = await api.put('/registration/me', fd);
      flash('success', res.message);
      const me = await api.get('/auth/me');
      setUser(me.user);
      state.reload();
    } catch (err) {
      setErrors(err.errors);
      window.scrollTo(0, 0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Guard state={state}>
      {({ application: a, departments, form, genders, editable }) => {
        const st = a.registration.status;
        const [label, tone] = REG_STATUS[st] || ['Unknown', 'neutral'];
        return (
          <>
            <div className="page-head">
              <div><h1>My registration</h1><p className="muted">{a.departmentName || 'No department'}{a.studentId ? ` · Student ID ${a.studentId}` : ''}</p></div>
              {st === 'approved' && <Link className="btn btn-primary" to="/courses"><Icon name="book" />Go to my courses</Link>}
            </div>

            <section className={`reg-status card reg-${st}`}>
              <div className="reg-status-main">
                <Badge tone={tone}>{label}</Badge>
                <p>{NEXT_STEP[st]}</p>
                {a.registration.reason && (st === 'correction_requested' || st === 'rejected') && (
                  <div className="feedback"><strong>{st === 'rejected' ? 'Reason' : 'What to correct'}:</strong> {a.registration.reason}</div>
                )}
              </div>
              <dl className="reg-facts">
                <div><dt>Submitted</dt><dd>{fmtDate(a.registration.submittedAt)}</dd></div>
                <div><dt>Reviewed</dt><dd>{a.registration.reviewedAt ? fmtDate(a.registration.reviewedAt) : '—'}</dd></div>
              </dl>
            </section>

            <section className="section two-col">
              <div>
                <h2>Documents</h2>
                <div className="card list">
                  {!a.registration.documents.length && <p className="muted pad">No documents uploaded.</p>}
                  {a.registration.documents.map((d) => (
                    <div key={d._id} className="list-row">
                      <span className="list-icon"><Icon name="file" /></span>
                      <span className="list-main"><strong>{d.label || d.name}</strong><small className="muted">{d.name} · {fmtBytes(d.size)} · {fmtDateTime(d.uploadedAt)}</small></span>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => openProtectedFile(d.url).catch((e) => flash('error', e.message))}><Icon name="eye" />Open</button>
                      {editable === 'full' && (
                        <ActionButton className="icon-btn danger" label="Remove document" confirm={`Remove ${d.name}?`}
                          onAction={async () => { try { flash('success', (await api.del(`/registration/me/documents/${d._id}`)).message); } catch (e) { flash('error', e.message); } state.reload(); }}>
                          <Icon name="trash" />
                        </ActionButton>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h2>History</h2>
                <RegistrationHistory history={a.registration.history} />
              </div>
            </section>

            {editable !== 'none' && (
              <section className="section">
                <h2>{editable === 'full' ? (st === 'correction_requested' ? 'Correct and resubmit' : 'Update your application') : 'Update your contact details'}</h2>
                {editable === 'contact' && <p className="muted small">Your name, department, programme and student ID are protected now that you are approved. Ask the registrar if they need to change.</p>}
                <RegistrationForm
                  mode={editable === 'full' ? 'student' : 'profile'}
                  departments={departments}
                  form={form}
                  genders={genders}
                  initial={a}
                  existingDocuments={a.registration.documents.length}
                  onSubmit={save}
                  busy={busy}
                  errors={errors}
                  submitLabel={editable === 'full' ? (st === 'correction_requested' ? 'Resubmit for review' : 'Save changes') : 'Save contact details'}
                />
              </section>
            )}
            {user.mustChangePassword && <p className="muted small">Remember to choose your own password.</p>}
          </>
        );
      }}
    </Guard>
  );
}
