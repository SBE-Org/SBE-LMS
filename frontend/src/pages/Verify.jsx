import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useTitle } from '../lib/useApi.js';
import { fmtDateLong } from '../lib/format.js';
import Icon from '../components/Icon.jsx';

/** Public page: anyone can check that a certificate number is genuine. */
export default function Verify() {
  const { meta, user } = useAuth();
  const [params, setParams] = useSearchParams();
  const code = params.get('code') || '';
  const [input, setInput] = useState(code);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  useTitle('Verify a certificate', meta.appName);

  useEffect(() => {
    setInput(code);
    setResult(null);
    setError(null);
    if (!code) return;
    api.get(`/verify${qs({ code })}`).then(setResult).catch((e) => setError(e.message));
  }, [code]);

  const submit = (e) => {
    e.preventDefault();
    setParams(input.trim() ? { code: input.trim() } : {});
  };

  return (
    <>
      <div className="card auth-card">
        <h1>Verify a certificate</h1>
        <p className="muted">Enter the certificate number printed at the bottom of the certificate.</p>
        <form onSubmit={submit} className="verify-form">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="SHG-2026-XXXXXXXXXX" aria-label="Certificate number" required />
          <button className="btn btn-primary" type="submit">Check</button>
        </form>
        {error && <div className="flash flash-error">{error}</div>}
        {result && (result.valid ? (
          <div className="verify-result ok">
            <Icon name="check" className="icon icon-lg" />
            <div>
              <strong>Valid certificate</strong>
              <p>{result.certificate.learnerName} completed <strong>{result.certificate.courseTitle}</strong> on {fmtDateLong(result.certificate.issuedAt)}.</p>
            </div>
          </div>
        ) : (
          <div className="verify-result bad">
            <Icon name="alert" className="icon icon-lg" />
            <div><strong>Not found</strong><p>No certificate with this number was issued by {meta.company}.</p></div>
          </div>
        ))}
      </div>
      <p className="center small">{user ? <Link to="/">Back to dashboard</Link> : <Link to="/login">Sign in</Link>}</p>
    </>
  );
}
