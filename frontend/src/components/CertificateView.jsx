import { forwardRef } from 'react';
import { apiUrl } from '../lib/api.js';
import { fmtDateLong } from '../lib/format.js';
import Icon from './Icon.jsx';

/**
 * The certificate itself, drawn from the administrator's branding settings.
 * Used by the certificate page (screen, print, PDF) and by the live preview in Settings.
 *
 * The logo honours two placements: "certificateTemplate" (screen and print) and
 * "certificatePdf" (downloaded PDF). See lib/certificatePdf.js for the PDF side.
 */
const CertificateView = forwardRef(function CertificateView({ cert, branding: b, verifyUrl, logoSrc }, ref) {
  const c = b?.certificate || {};
  const placements = b?.placements || {};
  const onScreen = placements.certificateTemplate?.enabled !== false;
  const inPdf = placements.certificatePdf?.enabled !== false;
  const src = logoSrc !== undefined ? logoSrc : apiUrl((c.useSeparateLogo && b?.certificateLogoUrl) || b?.logoUrl || null);
  const org = b?.institutionName || '';
  const app = b?.appName || '';
  const position = c.logoPosition || 'header';
  const keep = b?.keepAspectRatio !== false;

  const logo = (onScreen || inPdf) && (
    <div className={`cert-logo cert-logo-${position} align-${c.logoAlign || 'left'} size-${c.logoSize || 'medium'}`} data-screen={String(onScreen)} data-pdf={String(inPdf)}>
      {src
        ? <img src={src} alt={`${org} logo`} crossOrigin="anonymous" className={keep ? '' : 'stretch'} />
        : <span className="brand-mark cert-mark" aria-hidden="true">{(app || org || 'S').charAt(0).toUpperCase()}</span>}
      {b?.showNameWithLogo !== false && position !== 'bottom' && (
        <span className="cert-org"><strong>{org}</strong>{app && app !== org && <small>{app}</small>}</span>
      )}
    </div>
  );

  const signatories = (c.signatories?.length ? c.signatories : [{ name: '', title: 'Training Manager' }]).filter((s) => s.name || s.title || s.signatureUrl);
  const sigBlock = (s, i) => (
    <div key={`sig${i}`} className="cert-sig">
      {s.signatureUrl ? <img className="cert-signature" src={apiUrl(s.signatureUrl)} alt="" crossOrigin="anonymous" /> : <span className="cert-signature-space" />}
      <span className="cert-line" />
      <small>{s.title || 'Authorised signatory'}</small>
      <strong>{s.name || org}</strong>
    </div>
  );
  const seal = (
    <div key="seal" className={`cert-seal ${c.sealUrl ? 'has-image' : ''}`}>
      {c.sealUrl ? <img src={apiUrl(c.sealUrl)} alt="Official seal" crossOrigin="anonymous" /> : <Icon name="award" />}
    </div>
  );
  const dateBlock = (
    <div key="date" className="cert-sig">
      <span className="cert-signature-space" />
      <span className="cert-line" />
      <small>Date issued</small>
      <strong>{fmtDateLong(cert.issuedAt)}</strong>
    </div>
  );
  let foot;
  if (signatories.length <= 1) foot = [dateBlock, seal, ...signatories.map(sigBlock)];
  else foot = [sigBlock(signatories[0], 0), seal, ...signatories.slice(1).map((s, i) => sigBlock(s, i + 1))];

  return (
    <div className={`certificate ${cert.status && cert.status !== 'issued' ? 'is-draft' : ''}`} ref={ref}>
      <div className="cert-inner">
        {position === 'header' && logo}
        {cert.status === 'pending' && <div className="cert-watermark" aria-hidden="true">Awaiting authorisation</div>}
        {cert.status === 'revoked' && <div className="cert-watermark" aria-hidden="true">Revoked</div>}
        {position === 'top' && logo}
        <p className="cert-kicker">{c.title || 'Certificate of Completion'}</p>
        <p className="cert-small">This certifies that</p>
        <h1 className="cert-name">{cert.learnerName}</h1>
        {cert.employeeId && <p className="cert-small">ID {cert.employeeId}</p>}
        <p className="cert-small">has successfully completed the course</p>
        <h2 className="cert-course">{cert.courseTitle}</h2>
        {c.showDepartment !== false && cert.departmentName && <p className="cert-small cert-dept">{cert.departmentName}</p>}
        <p className="cert-small cert-dates">
          Completed {fmtDateLong(cert.completedAt || cert.issuedAt)}{signatories.length > 1 && <> · Issued {fmtDateLong(cert.issuedAt)}</>}
        </p>
        <div className="cert-foot">{foot}</div>
        {position === 'bottom' && logo}
        <p className="cert-verify">Certificate no. <strong>{cert.code}</strong>{verifyUrl && <> · Verify at {verifyUrl}</>}</p>
      </div>
    </div>
  );
});

export default CertificateView;
