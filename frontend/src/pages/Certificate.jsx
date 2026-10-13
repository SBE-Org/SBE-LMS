import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useApi, useBodyClass, useTitle } from '../lib/useApi.js';
import { fmtDateLong } from '../lib/format.js';
import Icon from '../components/Icon.jsx';
import { Guard } from '../components/ui.jsx';

/** Printable certificate (outside the normal layout, so it prints on one clean page). */
export default function CertificatePage() {
  const { code } = useParams();
  const { meta } = useAuth();
  const navigate = useNavigate();
  const state = useApi(`/certificates/${encodeURIComponent(code)}`);
  useBodyClass('cert-body');
  useTitle(state.data ? `Certificate · ${state.data.certificate.courseTitle}` : 'Certificate', meta.appName);

  return (
    <>
      <div className="cert-toolbar no-print">
        <button className="btn btn-ghost" type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/certificates'))}>
          <Icon name="arrow-left" />Back
        </button>
        <button className="btn btn-primary" type="button" onClick={() => window.print()}><Icon name="print" />Print or save as PDF</button>
      </div>
      <Guard state={state}>
        {({ certificate: c, company, appName }) => {
          const verifyUrl = `${window.location.origin}/verify?code=${encodeURIComponent(c.code)}`;
          return (
            <div className="certificate">
              <div className="cert-inner">
                <div className="cert-top">
                  <span className="brand-mark brand-mark-lg">S</span>
                  <div className="cert-org"><strong>{company}</strong><small>{appName}</small></div>
                </div>
                <p className="cert-kicker">Certificate of Completion</p>
                <p className="cert-small">This certifies that</p>
                <h1 className="cert-name">{c.learnerName}</h1>
                {c.employeeId && <p className="cert-small">Employee ID {c.employeeId}</p>}
                <p className="cert-small">has successfully completed the training course</p>
                <h2 className="cert-course">{c.courseTitle}</h2>
                <div className="cert-foot">
                  <div><span className="cert-line" /><small>Date issued</small><strong>{fmtDateLong(c.issuedAt)}</strong></div>
                  <div className="cert-seal"><Icon name="award" /></div>
                  <div><span className="cert-line" /><small>Training Manager</small><strong>{company}</strong></div>
                </div>
                <p className="cert-verify">Certificate no. <strong>{c.code}</strong> · Verify at {verifyUrl}</p>
              </div>
            </div>
          );
        }}
      </Guard>
    </>
  );
}
