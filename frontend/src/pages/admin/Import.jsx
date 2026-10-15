import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useTitle } from '../../lib/useApi.js';
import Icon from '../../components/Icon.jsx';
import { Badge, Crumbs, Errors } from '../../components/ui.jsx';

export default function ImportUsers() {
  const { meta } = useAuth();
  const [file, setFile] = useState(null);
  const [results, setResults] = useState(null);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [approve, setApprove] = useState(false);
  const [reason, setReason] = useState('');
  useTitle('Import people', meta.appName);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    const fd = new FormData();
    if (file) fd.append('csv', file);
    if (approve) {
      fd.append('approveStudents', 'true');
      fd.append('overrideReason', reason);
    }
    try {
      const res = await api.post('/admin/users/import', fd);
      setResults(res.results);
    } catch (err) {
      setErrors(err.errors);
    } finally {
      setBusy(false);
    }
  };

  const created = results?.filter((r) => r.status === 'Created') || [];
  const updated = results?.filter((r) => r.status === 'Updated') || [];
  const skipped = results?.filter((r) => r.status.startsWith('Skipped')) || [];

  return (
    <>
      <Crumbs items={[['People', '/admin/users'], ['Import']]} />
      <div className="page-head"><div><h1>Import people from CSV</h1><p className="muted">Add a whole training batch at once. Existing people (same email) are updated, not duplicated.</p></div></div>
      {results === null ? (
        <form onSubmit={submit} className="card form">
          <Errors errors={errors} />
          <label className="field"><span>CSV file</span><input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files[0] || null)} required /></label>
          <div className="help small">
            <p>The first row must be column names. <strong>name</strong> and <strong>email</strong> are required; the rest are optional:</p>
            <pre className="code">{`name,email,role,team,campaign,employee_id,password,department
Abebe Kebede,abebe.k@shaggar.com,student,Inbound Customer Care,Telecom support,SHG-0451,,CS
Tigist Haile,tigist.h@shaggar.com,team_lead,Outbound Sales,,SHG-0452,,`}</pre>
            <p>Role is one of <code>student</code> (or <code>agent</code>), <code>registrar</code>, <code>department_head</code>, <code>team_lead</code>, <code>trainer</code> (default student). Administrator accounts cannot be created or changed by import. <strong>department</strong> is a department name or code. Teams that don&apos;t exist are created. Empty passwords are generated and shown once after import. Excel: use <em>File → Save As → CSV UTF-8</em> so Amharic names are kept.</p>
          </div>
          <label className="check"><input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} /> <span><strong>Approve the registrations of new students</strong> — an administrator override, recorded in the audit log. Otherwise they stay pending until their Department Head approves them.</span></label>
          {approve && <label className="field"><span>Reason for the override</span><input value={reason} onChange={(e) => setReason(e.target.value)} required minLength={5} maxLength={500} placeholder="e.g. Batch already admitted by the academic board on 12 Oct" /></label>}
          <div className="actions"><button className="btn btn-primary" type="submit" disabled={busy}><Icon name="upload" />{busy ? 'Importing…' : 'Import'}</button></div>
        </form>
      ) : (
        <>
          <div className="flash flash-success">{created.length} created, {updated.length} updated, {skipped.length} skipped.</div>
          {created.length > 0 && <div className="flash flash-info">Copy the temporary passwords now — they are not shown again. Everyone must choose their own password at first sign-in.</div>}
          <div className="card table-wrap">
            <table className="table">
              <thead><tr><th>Row</th><th>Name</th><th>Email</th><th>Result</th><th>Temporary password</th></tr></thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.line}>
                    <td>{r.line}</td>
                    <td>{r.name}</td>
                    <td>{r.email}</td>
                    <td><Badge tone={r.status.startsWith('Skipped') ? 'danger' : r.status === 'Created' ? 'success' : 'info'}>{r.status}</Badge></td>
                    <td>{r.password ? <code>{r.password}</code> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p><Link className="btn btn-ghost" to="/admin/users">Back to people</Link></p>
        </>
      )}
    </>
  );
}
