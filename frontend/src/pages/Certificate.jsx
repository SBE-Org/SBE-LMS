import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useFlash } from '../lib/flash.jsx';
import { useApi, useBodyClass, useTitle } from '../lib/useApi.js';
import { downloadCertificatePdf } from '../lib/certificatePdf.js';
import Icon from '../components/Icon.jsx';
import CertificateView from '../components/CertificateView.jsx';
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
  const issued = state.data?.certificate.status === 'issued';

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
        <button className="btn btn-primary" type="button" onClick={download} disabled={!state.data || saving || !issued}>
          <Icon name="download" />{saving ? 'Preparing PDF…' : 'Download PDF'}
        </button>
        <button className="btn btn-ghost" type="button" onClick={() => window.print()} disabled={!issued}><Icon name="print" />Print</button>
      </div>
      <div className="no-print" style={{ maxWidth: 1050, margin: '0 auto', padding: '0 16px' }}>
        <Flashes />
        {state.data && !issued && (
          <div className="flash flash-info">
            {state.data.certificate.status === 'pending' ? 'Preview: this certificate is waiting for authorization and is not valid yet.' : 'This certificate has been revoked and is no longer valid.'}
          </div>
        )}
      </div>
      <Guard state={state}>
        {({ certificate, branding }) => (
          <CertificateView
            ref={certRef}
            cert={certificate}
            branding={branding}
            verifyUrl={`${window.location.origin}/verify?code=${encodeURIComponent(certificate.code)}`}
          />
        )}
      </Guard>
    </>
  );
}
