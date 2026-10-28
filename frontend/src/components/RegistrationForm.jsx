import { useEffect, useMemo, useState } from 'react';
import { Errors } from './ui.jsx';
import Icon from './Icon.jsx';
import { fmtBytes } from '../lib/format.js';

/**
 * The single, standard student registration form. Used for:
 *   mode="self"     public self-registration (with password)
 *   mode="staff"    a registrar or administrator registering / correcting a student
 *   mode="student"  a student correcting a returned application
 *   mode="profile"  an approved student updating contact details only
 * Which optional fields appear, and which are required, is set by administrators.
 * The server applies exactly the same rules, so nothing here can be bypassed.
 */
const SELF_EDITABLE_AFTER_APPROVAL = ['phone', 'address', 'emergencyContact', 'photo'];
const PHONE_PATTERN = '^\\+?[0-9\\s\\-\\(\\)\\.]{7,25}$'; // escaped for the browser's "v" regex mode

const fromApplication = (a) => ({
  name: a?.name || '',
  email: a?.email || '',
  department: a?.department ? String(a.department) : '',
  phone: a?.phone || '',
  program: a?.profile?.program || '',
  trainingCategory: a?.profile?.trainingCategory || '',
  dateOfBirth: a?.profile?.dateOfBirth || '',
  gender: a?.profile?.gender || '',
  address: a?.profile?.address || '',
  educationLevel: a?.profile?.educationLevel || '',
  qualifications: a?.profile?.qualifications || '',
  emergencyContactName: a?.profile?.emergencyContactName || '',
  emergencyContactPhone: a?.profile?.emergencyContactPhone || '',
  studentId: a?.studentId || '',
  password: '',
  passwordConfirm: '',
  termsAccepted: false,
});

const Req = () => <span className="req" aria-hidden="true">*</span>;

export default function RegistrationForm({
  mode, departments = [], form, genders = {}, initial = null, onSubmit, busy = false, errors = [], submitLabel = 'Submit', children, existingDocuments = 0,
}) {
  const [v, setV] = useState(() => fromApplication(initial));
  const [docs, setDocs] = useState([]); // [{file, label}]
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  useEffect(() => setV(fromApplication(initial)), [initial]);
  useEffect(() => () => photoPreview && URL.revokeObjectURL(photoPreview), [photoPreview]);

  const cfg = form?.fields || {};
  const limited = mode === 'profile';
  const state = (k) => (limited && !SELF_EDITABLE_AFTER_APPROVAL.includes(k) ? 'off' : cfg[k] || 'off');
  const on = (k) => state(k) !== 'off';
  const req = (k) => state(k) === 'required';
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const dept = useMemo(() => departments.find((d) => String(d._id) === v.department), [departments, v.department]);
  const isNew = !initial;
  const needsTerms = isNew || mode === 'student';

  const addDocs = (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    setDocs((list) => [...list, ...files.map((file) => ({ file, label: '' }))].slice(0, 5));
  };
  const choosePhoto = (e) => {
    const f = e.target.files[0] || null;
    setPhoto(f);
    setPhotoPreview(f ? URL.createObjectURL(f) : null);
  };

  const submit = (e) => {
    e.preventDefault();
    const fd = new FormData();
    const add = (k, val) => fd.append(k, val ?? '');
    if (!limited) {
      add('name', v.name.trim());
      add('email', v.email.trim());
      add('department', v.department);
      for (const k of ['program', 'trainingCategory', 'dateOfBirth', 'gender', 'educationLevel', 'qualifications']) if (on(k)) add(k, v[k]);
    }
    if (on('phone')) add('phone', v.phone.trim());
    if (on('address')) add('address', v.address);
    if (on('emergencyContact')) {
      add('emergencyContactName', v.emergencyContactName);
      add('emergencyContactPhone', v.emergencyContactPhone);
    }
    if (mode === 'staff') add('studentId', v.studentId.trim());
    if (mode === 'self') {
      add('password', v.password);
      add('passwordConfirm', v.passwordConfirm);
    }
    if (needsTerms) add('termsAccepted', v.termsAccepted ? 'true' : '');
    if (photo) fd.append('photo', photo);
    for (const d of docs) {
      fd.append('documents', d.file);
      fd.append('documentLabels', d.label);
    }
    onSubmit(fd, v);
  };

  return (
    <form onSubmit={submit} className="card form reg-form" noValidate={false}>
      <Errors errors={errors} />
      <p className="muted small"><Req /> Required field</p>

      {!limited && (
        <fieldset className="form-section">
          <legend>Personal details</legend>
          <div className="grid-2">
            <label className="field"><span>Full legal name <Req /></span>
              <input value={v.name} onChange={set('name')} maxLength={120} required autoComplete="name" placeholder="First, middle and last name" />
            </label>
            <label className="field"><span>Email address <Req /> {mode === 'self' && <small className="muted">— used to sign in</small>}</span>
              <input type="email" value={v.email} onChange={set('email')} maxLength={190} required autoComplete="email" />
            </label>
          </div>
          {(on('dateOfBirth') || on('gender')) && (
            <div className="grid-2">
              {on('dateOfBirth') && (
                <label className="field"><span>Date of birth {req('dateOfBirth') && <Req />}</span>
                  <input type="date" value={v.dateOfBirth} onChange={set('dateOfBirth')} required={req('dateOfBirth')} max={new Date().toISOString().slice(0, 10)} />
                </label>
              )}
              {on('gender') && (
                <label className="field"><span>Gender {req('gender') && <Req />}</span>
                  <select value={v.gender} onChange={set('gender')} required={req('gender')}>
                    <option value="">Choose…</option>
                    {Object.entries(genders).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}
        </fieldset>
      )}

      {(on('phone') || on('address') || on('emergencyContact')) && (
        <fieldset className="form-section">
          <legend>Contact</legend>
          <div className="grid-2">
            {on('phone') && (
              <label className="field"><span>Phone number {req('phone') && <Req />}</span>
                <input type="tel" value={v.phone} onChange={set('phone')} required={req('phone')} pattern={PHONE_PATTERN} maxLength={30} autoComplete="tel" placeholder="+251 911 234567"
                  title="7–15 digits; spaces, dashes, brackets and a leading + are allowed" />
              </label>
            )}
            {on('address') && (
              <label className="field"><span>Address / location {req('address') && <Req />}</span>
                <input value={v.address} onChange={set('address')} required={req('address')} maxLength={300} autoComplete="street-address" />
              </label>
            )}
          </div>
          {on('emergencyContact') && (
            <div className="grid-2">
              <label className="field"><span>Emergency contact name {req('emergencyContact') && <Req />}</span>
                <input value={v.emergencyContactName} onChange={set('emergencyContactName')} required={req('emergencyContact')} maxLength={120} />
              </label>
              <label className="field"><span>Emergency contact phone {req('emergencyContact') && <Req />}</span>
                <input type="tel" value={v.emergencyContactPhone} onChange={set('emergencyContactPhone')} required={req('emergencyContact')} pattern={PHONE_PATTERN} maxLength={30} />
              </label>
            </div>
          )}
        </fieldset>
      )}

      {!limited && (
        <fieldset className="form-section">
          <legend>Program</legend>
          <div className="grid-2">
            <label className="field"><span>Department <Req /></span>
              <select value={v.department} onChange={(e) => setV({ ...v, department: e.target.value, program: '' })} required>
                <option value="">Choose a department…</option>
                {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
            </label>
            {on('program') && (
              <label className="field"><span>Program / course {req('program') && <Req />}</span>
                {dept?.programs?.length ? (
                  <select value={v.program} onChange={set('program')} required={req('program')}>
                    <option value="">Choose…</option>
                    {dept.programs.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                ) : (
                  <input value={v.program} onChange={set('program')} required={req('program')} maxLength={160} placeholder={v.department ? '' : 'Choose a department first'} />
                )}
              </label>
            )}
          </div>
          <div className="grid-2">
            {on('trainingCategory') && (
              <label className="field"><span>Training category {req('trainingCategory') && <Req />}</span>
                <input value={v.trainingCategory} onChange={set('trainingCategory')} required={req('trainingCategory')} maxLength={120} placeholder="e.g. Full-time, Evening, Short course" />
              </label>
            )}
            {mode === 'staff' && (
              <label className="field"><span>Student ID <small className="muted">— leave empty to generate one on approval</small></span>
                <input value={v.studentId} onChange={set('studentId')} maxLength={50} pattern="[A-Za-z0-9][A-Za-z0-9_\.\/\-]{1,49}" />
              </label>
            )}
          </div>
          {(on('educationLevel') || on('qualifications')) && (
            <div className="grid-2">
              {on('educationLevel') && (
                <label className="field"><span>Highest education level {req('educationLevel') && <Req />}</span>
                  <input value={v.educationLevel} onChange={set('educationLevel')} required={req('educationLevel')} maxLength={120} list="edu-levels" />
                  <datalist id="edu-levels">{['Grade 10', 'Grade 12', 'Certificate', 'Diploma', 'Bachelor’s degree', 'Master’s degree'].map((x) => <option key={x} value={x} />)}</datalist>
                </label>
              )}
              {on('qualifications') && (
                <label className="field"><span>Qualifications {req('qualifications') && <Req />}</span>
                  <textarea rows={2} value={v.qualifications} onChange={set('qualifications')} required={req('qualifications')} maxLength={1000} />
                </label>
              )}
            </div>
          )}
        </fieldset>
      )}

      {(on('photo') || (on('documents') && !limited)) && (
        <fieldset className="form-section">
          <legend>Photo and documents</legend>
          {on('photo') && (
            <div className="field">
              <label className="label" htmlFor="reg-photo">Profile photograph {req('photo') && !initial?.photoUrl && <Req />} <small className="muted">— PNG or JPG, up to 5 MB</small></label>
              <div className="photo-row">
                {photoPreview && <img src={photoPreview} alt="Selected photograph preview" className="photo-preview" />}
                <input id="reg-photo" type="file" accept="image/png,image/jpeg" onChange={choosePhoto} required={req('photo') && !initial?.photoUrl} />
              </div>
              {initial?.photoUrl && !photo && <small className="muted">A photograph is already on file; choose a new one only to replace it.</small>}
            </div>
          )}
          {on('documents') && !limited && (
            <div className="field">
              <label className="label" htmlFor="reg-docs">Supporting documents {req('documents') && !existingDocuments && <Req />} <small className="muted">— PDF, PNG or JPG, up to 5 MB each, at most 5 at a time</small></label>
              <input id="reg-docs" type="file" multiple accept="application/pdf,image/png,image/jpeg" onChange={addDocs} required={req('documents') && !existingDocuments && !docs.length} />
              {docs.length > 0 && (
                <ul className="doc-list">
                  {docs.map((d, i) => (
                    <li key={i}>
                      <Icon name="file" />
                      <span className="doc-name">{d.file.name} <small className="muted">{fmtBytes(d.file.size)}</small></span>
                      <input aria-label={`Description of ${d.file.name}`} placeholder="What is it? e.g. Diploma, ID card" value={d.label} maxLength={120}
                        onChange={(e) => setDocs(docs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                      <button type="button" className="icon-btn danger" aria-label={`Remove ${d.file.name}`} onClick={() => setDocs(docs.filter((_, j) => j !== i))}><Icon name="x" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </fieldset>
      )}

      {mode === 'self' && (
        <fieldset className="form-section">
          <legend>Sign-in</legend>
          <div className="grid-2">
            <label className="field"><span>Password <Req /> <small className="muted">— at least 8 characters</small></span>
              <input type="password" value={v.password} onChange={set('password')} minLength={8} required autoComplete="new-password" />
            </label>
            <label className="field"><span>Confirm password <Req /></span>
              <input type="password" value={v.passwordConfirm} onChange={set('passwordConfirm')} minLength={8} required autoComplete="new-password" />
            </label>
          </div>
        </fieldset>
      )}

      {needsTerms && (
        <div className="terms">
          {form?.termsText && <p className="small muted terms-text">{form.termsText}</p>}
          <label className="check">
            <input type="checkbox" checked={v.termsAccepted} onChange={set('termsAccepted')} required />
            <span>{mode === 'staff'
              ? <><strong>The student has read and accepted</strong> the terms and privacy notice. <Req /></>
              : <>I have read and accept the terms and privacy notice. <Req /></>}</span>
          </label>
        </div>
      )}

      {children}
      <div className="actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
      </div>
    </form>
  );
}
