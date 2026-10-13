import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useApi, useTitle } from '../lib/useApi.js';
import { fmtDate } from '../lib/format.js';
import Icon from '../components/Icon.jsx';
import { EmptyState, Guard } from '../components/ui.jsx';

export default function Certificates() {
  const { meta } = useAuth();
  const state = useApi('/certificates');
  useTitle('My certificates', meta.appName);
  return (
    <>
      <div className="page-head">
        <div><h1>My certificates</h1><p className="muted">Print them or save them as PDF. Anyone can check a certificate is genuine on the verification page.</p></div>
      </div>
      <Guard state={state}>
        {({ certificates }) =>
          !certificates.length ? (
            <EmptyState icon="award" title="No certificates yet">
              <p className="muted">Complete every lesson and pass every quiz in a course to earn its certificate.</p>
            </EmptyState>
          ) : (
            <div className="cert-grid">
              {certificates.map((c) => (
                <Link key={c._id} className="cert-card card" to={`/certificates/${c.code}`}>
                  <span className="cert-card-icon"><Icon name="award" className="icon icon-lg" /></span>
                  <strong>{c.title}</strong>
                  <small className="muted">{fmtDate(c.issuedAt)}</small>
                  <code className="small">{c.code}</code>
                </Link>
              ))}
            </div>
          )
        }
      </Guard>
    </>
  );
}
