import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useFlash } from '../lib/flash.jsx';
import { useApi, useBodyClass, useTitle } from '../lib/useApi.js';
import { fmtDateLong } from '../lib/format.js';
import { downloadCertificatePdf } from '../lib/certificatePdf.js';
import Icon from '../components/Icon.jsx';
import { Flashes } from '../components/Layout.jsx';
import { Guard } from '../components/ui.jsx';

/** Certificate page (outside the normal layout): download as PDF or print. */
export default function CertificatePage() {
  const { code } = useParams();
  const { meta } = useAuth();
  const { flash } = useFlash();
  const navigate = useNavigate();
  const state = useApi(`/certificates/${encodeURIComponent(code)}`);
  const certRef = useRef(null);
  const [saving, setSaving] = useState(false);
  useBodyClass('cert-body');
  useTitle(state.data ? `Certificate · ${state.data.certificate.courseTitle}` : 'Certificate', meta.appName);

  const download = async () => {
    if (!certRef.current) return;
    setSaving(true);
    try {
      const c = state.data.certificate;
      const safeName = c.learnerName.replace(/[\\/:*?"<>|]+/g, '').trim();
      await downloadCertificatePdf(certRef.current, `Certificate ${c.code} - ${safeName}.pdf`);
    } catch (e) {
      console.error(e);
      flash('error', 'The PDF could not be created. You can use “Print” and choose “Save as PDF” instead.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="cert-toolbar no-print">
        <button className="btn btn-ghost" type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/certificates'))}>
          <Icon name="arrow-left" />Back
        </button>
        <button className="btn btn-primary" type="button" onClick={download} disabled={!state.data || saving}>
          <Icon name="download" />{saving ? 'Preparing PDF…' : 'Download PDF'}
        </button>
        <button className="btn btn-ghost" type="button" onClick={() => window.print()}><Icon name="print" />Print</button>
      </div>
      <div className="no-print" style={{ maxWidth: 1050, margin: '0 auto', padding: '0 16px' }}><Flashes /></div>
      <Guard state={state}>
        {({ certificate: c, company, appName }) => {
          const verifyUrl = `${window.location.origin}/verify?code=${encodeURIComponent(c.code)}`;
          return (
            <div className="certificate" ref={certRef}>
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
