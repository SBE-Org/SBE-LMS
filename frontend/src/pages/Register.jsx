import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useFlash } from '../lib/flash.jsx';
import { useTitle } from '../lib/useApi.js';
import RegistrationForm from '../components/RegistrationForm.jsx';

const GENDERS = { female: 'Female', male: 'Male', other: 'Other', prefer_not_to_say: 'Prefer not to say' };

/** Public self-registration. The account starts with a pending application. */
export default function Register() {
  const { meta, signIn } = useAuth();
  const { flash } = useFlash();
  const navigate = useNavigate();
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  useTitle('Register', meta.appName);

  if (meta.registration && meta.registration.allowSelfRegistration === false) {
    return (
      <div className="card auth-card">
        <h1>Registration</h1>
        <p className="muted">Online self-registration is closed. Please contact the registrar’s office to register.</p>
        <p><Link className="btn btn-primary" to="/login">Back to sign in</Link></p>
      </div>
    );
  }

  const submit = async (fd) => {
    setBusy(true);
    setErrors([]);
    try {
      const res = await api.post('/auth/register', fd);
      signIn(res.token, res.user);
      flash('success', res.message);
      navigate('/registration', { replace: true });
    } catch (err) {
      setErrors(err.errors);
      setBusy(false);
      window.scrollTo(0, 0);
    }
  };

  return (
    <>
      <div className="card auth-card auth-card-head">
        <h1>Student registration</h1>
        <p className="muted">Create your account and apply to a department. Your department will review your application; you can follow its status after signing in.</p>
      </div>
      <RegistrationForm
        mode="self"
        departments={meta.departments || []}
        form={meta.registration}
        genders={GENDERS}
        onSubmit={submit}
        busy={busy}
        errors={errors}
        submitLabel="Submit registration"
      />
      <p className="center small">Already registered? <Link to="/login">Sign in</Link></p>
    </>
  );
}
