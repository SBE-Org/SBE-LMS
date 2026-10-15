import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useFlash } from '../../lib/flash.jsx';
import { useApi, useTitle } from '../../lib/useApi.js';
import { Crumbs, Guard } from '../../components/ui.jsx';
import RegistrationForm from '../../components/RegistrationForm.jsx';

/**
 * Registrar / administrator: register a student, or correct a student's details.
 * Same form and validation as self-registration. Creating an account never approves it.
 */
export default function StudentForm() {
  const { id } = useParams();
  const editing = !!id;
  const { meta } = useAuth();
  const { flashAll, flash } = useFlash();
  const navigate = useNavigate();
  const state = useApi(editing ? `/registrations/${id}` : '/registrations/form');
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [resubmit, setResubmit] = useState(true);
  const [created, setCreated] = useState(null);
  useTitle(editing ? 'Edit student' : 'Register a student', meta.appName);

  const submit = async (fd) => {
    setBusy(true);
    setErrors([]);
    try {
      if (editing) {
        if (state.data.application.registration.status === 'correction_requested' && resubmit) fd.append('resubmit', 'true');
        const res = await api.put(`/registrations/${id}`, fd);
        flash('success', res.message);
        navigate(`/registrations/${id}`);
      } else {
        const res = await api.post('/registrations', fd);
        flashAll(res.messages);
        setCreated(res);
        window.scrollTo(0, 0);
      }
    } catch (err) {
      setErrors(err.errors);
      window.scrollTo(0, 0);
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <>
        <Crumbs items={[['Registrations', '/registrations'], ['Student registered']]} />
        <div className="card form">
          <h1>Student account created</h1>
          <p><strong>{created.application.name}</strong> ({created.application.email}) can sign in with this temporary password, and will choose their own at first sign-in:</p>
          <p className="temp-password"><code>{created.temporaryPassword}</code></p>
          <p className="muted small">Share it privately. It is not shown again. The registration stays <strong>pending</strong> until the Department Head reviews it.</p>
          <div className="actions">
            <Link className="btn btn-primary" to={`/registrations/${created.application._id}`}>Open the application</Link>
            <button type="button" className="btn btn-ghost" onClick={() => { setCreated(null); setErrors([]); }}>Register another student</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <Guard state={state}>
      {(data) => (
        <>
          <Crumbs items={editing ? [['Registrations', '/registrations'], [data.application.name, `/registrations/${id}`], ['Edit']] : [['Registrations', '/registrations'], ['Register a student']]} />
          <div className="page-head">
            <div>
              <h1>{editing ? `Edit ${data.application.name}` : 'Register a student'}</h1>
              <p className="muted">{editing ? 'Corrections are recorded in the application history and the audit log.' : 'Use this when a student cannot register themselves. The same form and rules apply as for self-registration.'}</p>
            </div>
          </div>
          {editing && !data.canEdit ? (
            <div className="flash flash-error">You cannot edit this student.</div>
          ) : (
            <RegistrationForm
              mode="staff"
              departments={data.departments}
              form={data.form}
              genders={data.genders}
              initial={editing ? data.application : null}
              existingDocuments={editing ? data.application.registration.documents.length : 0}
              onSubmit={submit}
              busy={busy}
              errors={errors}
              submitLabel={editing ? 'Save changes' : 'Create student account'}
            >
              {editing && data.application.registration.status === 'correction_requested' && (
                <label className="check"><input type="checkbox" checked={resubmit} onChange={(e) => setResubmit(e.target.checked)} /> <span>Send the corrected application back to the Department Head for review</span></label>
              )}
            </RegistrationForm>
          )}
        </>
      )}
    </Guard>
  );
}
