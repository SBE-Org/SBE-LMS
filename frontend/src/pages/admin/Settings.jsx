import { useEffect, useMemo, useState } from 'react';
import { api, apiUrl } from '../../lib/api.js';
import { useAuth, tint } from '../../lib/auth.jsx';
import { useFlash } from '../../lib/flash.jsx';
import { useApi, useTitle } from '../../lib/useApi.js';
import Icon from '../../components/Icon.jsx';
import Logo from '../../components/Logo.jsx';
import CertificateView from '../../components/CertificateView.jsx';
import { Errors, Guard } from '../../components/ui.jsx';

const TABS = [['branding', 'Branding and appearance'], ['certificate', 'Certificates'], ['registration', 'Registration form']];
const SIZES = [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']];
const ALIGNS = [['left', 'Left'], ['center', 'Center'], ['right', 'Right']];
const MAX_IMAGE_MB = 2;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'];
/** Placements whose size/alignment are fixed by the layout or set on the Certificates tab. */
const FIXED_ALIGN = ['header'];
const CERT_PLACEMENTS = ['certificateTemplate', 'certificatePdf'];

// ---- color contrast (WCAG 2.1) -------------------------------------------------------
function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

function toDraft(data) {
  const s = data.settings;
  const b = s.branding || {};
  const c = s.certificate || {};
  const r = s.registration || {};
  return {
    branding: {
      institutionName: b.institutionName || '',
      appName: b.appName || '',
      tagline: b.tagline || '',
      colors: { ...data.branding.colors },
      keepAspectRatio: b.keepAspectRatio !== false,
      showNameWithLogo: b.showNameWithLogo !== false,
      placements: JSON.parse(JSON.stringify(data.branding.placements || {})),
    },
    certificate: {
      title: c.title || 'Certificate of Completion',
      useSeparateLogo: !!c.useSeparateLogo,
      logoPosition: c.logoPosition || 'header',
      logoSize: c.logoSize || 'medium',
      logoAlign: c.logoAlign || 'left',
      showDepartment: c.showDepartment !== false,
      // "from" = position of the saved signatory, so its signature image follows it when others are removed.
      signatories: (c.signatories?.length ? c.signatories : [{ name: '', title: 'Training Manager' }]).map((x, i) => ({ name: x.name || '', title: x.title || '', from: c.signatories?.length ? i : null })),
    },
    registration: {
      allowSelfRegistration: r.allowSelfRegistration !== false,
      studentIdPrefix: r.studentIdPrefix || 'STU',
      termsText: r.termsText || '',
      fields: { ...(data.registration.fields || {}) },
    },
  };
}

/** Upload / replace / remove one image, with a local preview before anything is saved. */
function ImageSlot({ kind, label, help, currentUrl, onSaved, onPending }) {
  const { flash } = useFlash();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const choose = (e) => {
    const f = e.target.files[0] || null;
    e.target.value = '';
    setErrors([]);
    if (!f) return;
    const problems = [];
    if (!IMAGE_TYPES.includes(f.type)) problems.push('Choose a PNG, JPG or SVG image.');
    if (f.size > MAX_IMAGE_MB * 1024 * 1024) problems.push(`The image is larger than ${MAX_IMAGE_MB} MB.`);
    if (problems.length) return setErrors(problems);
    const url = URL.createObjectURL(f);
    setFile(f);
    setPreview(url);
    onPending?.(url);
  };
  const cancel = () => {
    setFile(null);
    setPreview(null);
    onPending?.(null);
  };
  const upload = async () => {
    setBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post(`/admin/settings/files/${kind}`, fd);
      flash('success', res.message);
      cancel();
      onSaved(res);
    } catch (err) {
      setErrors(err.errors); // the current image is kept
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!window.confirm(`Remove the ${label.toLowerCase()}?`)) return;
    try {
      const res = await api.del(`/admin/settings/files/${kind}`);
      flash('success', res.message);
      onSaved(res);
    } catch (err) {
      setErrors(err.errors);
    }
  };

  const shown = preview || (currentUrl ? apiUrl(currentUrl) : null);
  return (
    <div className="image-slot">
      <div className="image-slot-preview" aria-live="polite">
        {shown ? <img src={shown} alt={`${label} preview`} /> : <span className="muted small">None</span>}
        {preview && <span className="badge badge-warning">Not saved yet</span>}
      </div>
      <div className="image-slot-body">
        <strong>{label}</strong>
        {help && <small className="muted">{help}</small>}
        <Errors errors={errors} />
        <div className="actions">
          <label className="btn btn-ghost btn-sm file-btn">
            <Icon name="upload" />{currentUrl ? 'Choose replacement…' : 'Choose image…'}
            <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={choose} className="sr-only" />
          </label>
          {file && <button type="button" className="btn btn-primary btn-sm" onClick={upload} disabled={busy}>{busy ? 'Uploading…' : 'Save image'}</button>}
          {file && <button type="button" className="btn btn-ghost btn-sm" onClick={cancel}>Cancel</button>}
          {!file && currentUrl && <button type="button" className="btn btn-ghost btn-sm danger" onClick={remove}><Icon name="trash" />Remove</button>}
        </div>
      </div>
    </div>
  );
}

const SAMPLE_CERT = {
  code: 'STU-2026-PREVIEW01', status: 'issued', learnerName: 'Hana Tesfaye', courseTitle: 'Customer Service Excellence',
  departmentName: 'Customer Service', issuedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
};

/** Small, faithful mock-ups of each place the logo can appear, using the unsaved settings. */
function LivePreview({ branding, placementLabels, logoSrc, target, setTarget }) {
  const vars = {
    '--brand': branding.colors.primary, '--brand-ink': branding.colors.primaryDark, '--accent': branding.colors.accent,
    '--brand-soft': tint(branding.colors.primary, 0.12), '--accent-soft': tint(branding.colors.accent, 0.16),
  };
  const p = branding.placements[target];
  const logo = <Logo placement={target} branding={branding} src={logoSrc} />;
  let body;
  if (CERT_PLACEMENTS.includes(target)) {
    body = (
      <div className="preview-cert">
        <CertificateView cert={SAMPLE_CERT} branding={target === 'certificatePdf' ? { ...branding, placements: { ...branding.placements, certificateTemplate: branding.placements.certificatePdf } } : branding}
          logoSrc={logoSrc} verifyUrl="https://…/verify" />
      </div>
    );
  } else if (target === 'login' || target === 'register') {
    body = (
      <div className="preview-auth">
        {p?.enabled ? <Logo placement={target} branding={branding} src={logoSrc} className="logo-on-dark" /> : <div className="auth-brand"><div><strong>{branding.appName}</strong><small>{branding.institutionName}</small></div></div>}
        <div className="card preview-card"><strong>{target === 'login' ? 'Sign in' : 'Student registration'}</strong><span className="preview-input" /><span className="preview-input" /><span className="btn btn-primary btn-sm">Continue</span></div>
      </div>
    );
  } else if (target === 'header') {
    body = (
      <div className="preview-shell">
        <div className="sidebar preview-sidebar"><span className="brand"><Logo placement="header" compact branding={branding} src={logoSrc} /></span><span className="preview-nav" /><span className="preview-nav" /><span className="preview-nav" /></div>
        <div className="preview-main"><span className="preview-line wide" /><span className="preview-line" /></div>
      </div>
    );
  } else if (target === 'reports') {
    body = (
      <div className="preview-page">
        {logo}
        <strong>Training report</strong>
        <span className="preview-line wide" /><span className="preview-line" /><span className="preview-line wide" />
      </div>
    );
  } else {
    body = (
      <div className="preview-page">
        {logo}
        <strong>{target === 'coursePages' ? 'Call Handling Excellence' : 'Good morning, Hana'}</strong>
        <div className="preview-stats"><span /><span /><span /></div>
      </div>
    );
  }
  return (
    <div className="card live-preview" style={vars}>
      <div className="live-preview-head">
        <strong>Live preview</strong>
        <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Preview location">
          {Object.entries(placementLabels).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>
      {!p?.enabled && <p className="small muted">The logo is switched off here{target === 'header' || target === 'login' || target === 'register' ? '; the name is shown instead' : ''}.</p>}
      <div className="live-preview-stage">{body}</div>
    </div>
  );
}

export default function Settings() {
  const { meta, refreshMeta } = useAuth();
  const { flash } = useFlash();
  const state = useApi('/admin/settings');
  const [tab, setTab] = useState(() => {
    try { return localStorage.getItem('shaggar_settings_tab') || 'branding'; } catch { return 'branding'; }
  });
  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [pendingLogo, setPendingLogo] = useState(null);
  const [pendingCertLogo, setPendingCertLogo] = useState(null);
  const [target, setTarget] = useState('login');
  useTitle('Branding & settings', meta.appName);

  useEffect(() => {
    if (state.data && !draft) setDraft(toDraft(state.data));
  }, [state.data, draft]);
  useEffect(() => {
    try { localStorage.setItem('shaggar_settings_tab', tab); } catch { /* private mode */ }
    if (tab === 'certificate') setTarget('certificateTemplate');
  }, [tab]);

  /** New server state. After saving a section, only that section of the draft is refreshed. */
  const afterServer = (res, section = null) => {
    state.setData(res);
    if (section) setDraft((d) => ({ ...d, [section]: toDraft(res)[section] }));
    refreshMeta();
  };

  const save = async (section) => {
    setBusy(true);
    setErrors([]);
    try {
      const res = await api.put('/admin/settings', { [section]: draft[section] });
      flash('success', res.message);
      afterServer(res, section);
    } catch (err) {
      setErrors(err.errors);
    } finally {
      setBusy(false);
    }
  };

  // Preview = saved images + unsaved text, colors and placements.
  const preview = useMemo(() => {
    if (!state.data || !draft) return null;
    const pub = state.data.branding;
    return {
      ...pub,
      institutionName: draft.branding.institutionName || meta.company,
      appName: draft.branding.appName || meta.appName,
      colors: draft.branding.colors,
      keepAspectRatio: draft.branding.keepAspectRatio,
      showNameWithLogo: draft.branding.showNameWithLogo,
      placements: draft.branding.placements,
      certificateLogoUrl: pub.certificateLogoUrl,
      certificate: {
        ...pub.certificate,
        ...draft.certificate,
        signatories: draft.certificate.signatories.map((s) => ({ ...s, signatureUrl: s.from != null ? pub.certificate.signatories[s.from]?.signatureUrl || null : null })),
      },
    };
  }, [state.data, draft, meta.company, meta.appName]);

  const certLogoSrc = draft?.certificate.useSeparateLogo
    ? pendingCertLogo || (state.data?.branding.certificateLogoUrl ? apiUrl(state.data.branding.certificateLogoUrl) : pendingLogo || (state.data?.branding.logoUrl ? apiUrl(state.data.branding.logoUrl) : null))
    : pendingLogo || undefined;
  const logoSrc = CERT_PLACEMENTS.includes(target) ? certLogoSrc : pendingLogo || undefined;

  const setB = (k, v) => setDraft((d) => ({ ...d, branding: { ...d.branding, [k]: v } }));
  const setColor = (k, v) => setDraft((d) => ({ ...d, branding: { ...d.branding, colors: { ...d.branding.colors, [k]: v } } }));
  const setPlacement = (k, field, v) => setDraft((d) => ({ ...d, branding: { ...d.branding, placements: { ...d.branding.placements, [k]: { ...d.branding.placements[k], [field]: v } } } }));
  const setC = (k, v) => setDraft((d) => ({ ...d, certificate: { ...d.certificate, [k]: v } }));
  const setSig = (i, k, v) => setDraft((d) => ({ ...d, certificate: { ...d.certificate, signatories: d.certificate.signatories.map((s, j) => (j === i ? { ...s, [k]: v } : s)) } }));
  const setR = (k, v) => setDraft((d) => ({ ...d, registration: { ...d.registration, [k]: v } }));

  return (
    <Guard state={{ ...state, data: draft && state.data }}>
      {(data) => {
        const c = draft.branding.colors;
        const ratios = [
          ['Buttons and links (primary on white)', contrast(c.primary, '#ffffff')],
          ['Navigation (white on dark primary)', contrast(c.primaryDark, '#ffffff')],
        ];
        return (
          <>
            <div className="page-head">
              <div><h1>Branding & settings</h1><p className="muted">Changes apply to everyone without a redeploy. Only administrators can change these settings.</p></div>
            </div>
            <nav className="tabs" role="tablist" aria-label="Settings sections">
              {TABS.map(([k, label]) => (
                <a key={k} href={`#${k}`} role="tab" aria-selected={tab === k} aria-current={tab === k ? 'page' : undefined} onClick={(e) => { e.preventDefault(); setTab(k); setErrors([]); }}>{label}</a>
              ))}
            </nav>
            <Errors errors={errors} />

            {tab === 'branding' && (
              <div className="settings-layout">
                <div className="settings-main">
                  <section className="card form">
                    <h2>Institution</h2>
                    <div className="grid-2">
                      <label className="field"><span>Institution name</span><input value={draft.branding.institutionName} onChange={(e) => setB('institutionName', e.target.value)} maxLength={160} placeholder={meta.company} /></label>
                      <label className="field"><span>Platform name</span><input value={draft.branding.appName} onChange={(e) => setB('appName', e.target.value)} maxLength={120} placeholder={meta.appName} /></label>
                    </div>
                    <div className="grid-3">
                      {[['primary', 'Primary color'], ['primaryDark', 'Dark primary (navigation)'], ['accent', 'Accent color']].map(([k, label]) => (
                        <label key={k} className="field"><span>{label}</span>
                          <span className="color-field">
                            <input type="color" value={c[k]} onChange={(e) => setColor(k, e.target.value)} aria-label={`${label} picker`} />
                            <input value={c[k]} onChange={(e) => setColor(k, e.target.value)} maxLength={7} pattern="#[0-9a-fA-F]{6}" />
                          </span>
                        </label>
                      ))}
                    </div>
                    <ul className="contrast-list small">
                      {ratios.map(([label, r]) => (
                        <li key={label} className={r >= 4.5 ? 'text-success' : 'text-danger'}>
                          <Icon name={r >= 4.5 ? 'check' : 'alert'} className="icon icon-inline" /> {label}: contrast {r.toFixed(1)}:1 {r >= 4.5 ? '— readable' : '— too low; choose a darker color (at least 4.5:1)'}
                        </li>
                      ))}
                    </ul>
                    <div className="actions"><button type="button" className="btn btn-primary" onClick={() => save('branding')} disabled={busy}>Save branding</button></div>
                  </section>

                  <section className="card form">
                    <h2>Logo</h2>
                    <p className="muted small">PNG, JPG or SVG up to {MAX_IMAGE_MB} MB. A transparent PNG or an SVG works best. The current logo stays in place until a replacement has been saved.</p>
                    <ImageSlot kind="logo" label="Institutional logo" currentUrl={data.branding.logoUrl} onSaved={(res) => afterServer(res)} onPending={setPendingLogo} />
                    <label className="check"><input type="checkbox" checked={draft.branding.keepAspectRatio} onChange={(e) => setB('keepAspectRatio', e.target.checked)} /> <span><strong>Keep the original aspect ratio</strong> — otherwise the logo is fitted into a square</span></label>
                    <label className="check"><input type="checkbox" checked={draft.branding.showNameWithLogo} onChange={(e) => setB('showNameWithLogo', e.target.checked)} /> <span><strong>Show the institution name beside the logo</strong></span></label>
                  </section>

                  <section className="card form">
                    <h2>Where the logo appears</h2>
                    <p className="muted small">Tick every place the logo should appear. Where it is switched off, no logo is shown there.</p>
                    <div className="table-wrap">
                      <table className="table placements">
                        <thead><tr><th>Location</th><th>Show logo</th><th>Size</th><th>Alignment</th></tr></thead>
                        <tbody>
                          {Object.entries(data.placementLabels).map(([k, label]) => {
                            const pl = draft.branding.placements[k] || {};
                            const cert = CERT_PLACEMENTS.includes(k);
                            return (
                              <tr key={k} className={pl.enabled ? '' : 'is-muted'} onClick={() => setTarget(k)}>
                                <td><label htmlFor={`pl-${k}`}>{label}</label></td>
                                <td><input id={`pl-${k}`} type="checkbox" className="switch" checked={!!pl.enabled} onChange={(e) => setPlacement(k, 'enabled', e.target.checked)} /></td>
                                <td>
                                  {cert ? <small className="muted">Certificates tab</small> : (
                                    <select value={pl.size || 'medium'} onChange={(e) => setPlacement(k, 'size', e.target.value)} disabled={!pl.enabled} aria-label={`${label} size`}>
                                      {SIZES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                    </select>
                                  )}
                                </td>
                                <td>
                                  {cert ? <small className="muted">Certificates tab</small> : FIXED_ALIGN.includes(k) ? <small className="muted">Set by layout</small> : (
                                    <select value={pl.align || 'left'} onChange={(e) => setPlacement(k, 'align', e.target.value)} disabled={!pl.enabled} aria-label={`${label} alignment`}>
                                      {ALIGNS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                    </select>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="actions">
                      <button type="button" className="btn btn-primary" onClick={() => save('branding')} disabled={busy}>Save logo settings</button>
                      <button type="button" className="btn btn-ghost" onClick={() => setDraft(toDraft(data))}>Discard changes</button>
                    </div>
                  </section>
                </div>
                <aside className="settings-side">
                  {preview && <LivePreview branding={preview} placementLabels={data.placementLabels} logoSrc={logoSrc} target={target} setTarget={setTarget} />}
                </aside>
              </div>
            )}

            {tab === 'certificate' && (
              <div className="settings-layout">
                <div className="settings-main">
                  <section className="card form">
                    <h2>Certificate layout</h2>
                    <label className="field"><span>Title</span><input value={draft.certificate.title} onChange={(e) => setC('title', e.target.value)} maxLength={80} /></label>
                    <div className="grid-3">
                      <label className="field"><span>Logo position</span>
                        <select value={draft.certificate.logoPosition} onChange={(e) => setC('logoPosition', e.target.value)}>
                          <option value="header">Header corner</option><option value="top">Above the title</option><option value="bottom">Bottom</option>
                        </select>
                      </label>
                      <label className="field"><span>Logo size</span>
                        <select value={draft.certificate.logoSize} onChange={(e) => setC('logoSize', e.target.value)}>{SIZES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                      </label>
                      <label className="field"><span>Logo alignment</span>
                        <select value={draft.certificate.logoAlign} onChange={(e) => setC('logoAlign', e.target.value)}>{ALIGNS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                      </label>
                    </div>
                    <div className="placement-quick">
                      <label className="check"><input type="checkbox" checked={!!draft.branding.placements.certificateTemplate?.enabled} onChange={(e) => setPlacement('certificateTemplate', 'enabled', e.target.checked)} /> <span>Logo on the certificate (screen and print)</span></label>
                      <label className="check"><input type="checkbox" checked={!!draft.branding.placements.certificatePdf?.enabled} onChange={(e) => setPlacement('certificatePdf', 'enabled', e.target.checked)} /> <span>Logo on downloaded PDF certificates</span></label>
                      <label className="check"><input type="checkbox" checked={draft.certificate.showDepartment} onChange={(e) => setC('showDepartment', e.target.checked)} /> <span>Show the department name</span></label>
                    </div>
                    <label className="check"><input type="checkbox" checked={draft.certificate.useSeparateLogo} onChange={(e) => setC('useSeparateLogo', e.target.checked)} /> <span><strong>Use a separate logo on certificates</strong> (e.g. a full-color or high-resolution version)</span></label>
                    {draft.certificate.useSeparateLogo && (
                      <ImageSlot kind="certificateLogo" label="Certificate logo" help="Falls back to the main logo when empty." currentUrl={data.branding.certificateLogoUrl} onSaved={(res) => afterServer(res)} onPending={setPendingCertLogo} />
                    )}
                    <div className="actions"><button type="button" className="btn btn-primary" onClick={async () => { await save('certificate'); }} disabled={busy}>Save certificate layout</button>
                      <button type="button" className="btn btn-ghost" onClick={() => save('branding')} disabled={busy}>Save logo on/off</button></div>
                  </section>

                  <section className="card form">
                    <h2>Signatories and seal</h2>
                    <p className="muted small">Up to three people sign the certificate. Signature images: transparent PNG or SVG works best. Save names first, then add signature images.</p>
                    {draft.certificate.signatories.map((s, i) => (
                      <div key={i} className="signatory">
                        <div className="grid-2">
                          <label className="field"><span>Signatory {i + 1} name</span><input value={s.name} onChange={(e) => setSig(i, 'name', e.target.value)} maxLength={120} /></label>
                          <label className="field"><span>Title</span><input value={s.title} onChange={(e) => setSig(i, 'title', e.target.value)} maxLength={120} placeholder="e.g. Academic Director" /></label>
                        </div>
                        {s.from === i
                          ? <ImageSlot kind={`signature${i}`} label={`Signature ${i + 1}`} currentUrl={data.branding.certificate.signatories[i]?.signatureUrl} onSaved={(res) => afterServer(res)} />
                          : <p className="small muted">Save to add a signature image.</p>}
                        {draft.certificate.signatories.length > 1 && (
                          <button type="button" className="btn btn-ghost btn-sm danger" onClick={() => setC('signatories', draft.certificate.signatories.filter((_, j) => j !== i))}><Icon name="trash" />Remove signatory</button>
                        )}
                      </div>
                    ))}
                    {draft.certificate.signatories.length < 3 && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setC('signatories', [...draft.certificate.signatories, { name: '', title: '', from: null }])}><Icon name="plus" />Add signatory</button>
                    )}
                    <ImageSlot kind="seal" label="Institutional seal" help="Shown in the middle of the certificate footer. Without one, a simple award mark is used." currentUrl={data.branding.certificate.sealUrl} onSaved={(res) => afterServer(res)} />
                    <div className="actions"><button type="button" className="btn btn-primary" onClick={() => save('certificate')} disabled={busy}>Save signatories</button></div>
                  </section>
                </div>
                <aside className="settings-side">
                  {preview && <LivePreview branding={preview} placementLabels={{ certificateTemplate: data.placementLabels.certificateTemplate, certificatePdf: data.placementLabels.certificatePdf }}
                    logoSrc={certLogoSrc} target={CERT_PLACEMENTS.includes(target) ? target : 'certificateTemplate'} setTarget={setTarget} />}
                </aside>
              </div>
            )}

            {tab === 'registration' && (
              <section className="card form">
                <h2>Student registration form</h2>
                <label className="check"><input type="checkbox" checked={draft.registration.allowSelfRegistration} onChange={(e) => setR('allowSelfRegistration', e.target.checked)} /> <span><strong>Allow self-registration</strong> — students can apply on the public registration page. Registrars can always register students.</span></label>
                <label className="field narrow"><span>Student ID prefix <small className="muted">— IDs look like {draft.registration.studentIdPrefix || 'STU'}-{new Date().getFullYear()}-00042 and are assigned on approval</small></span>
                  <input value={draft.registration.studentIdPrefix} onChange={(e) => setR('studentIdPrefix', e.target.value.toUpperCase())} maxLength={10} pattern="[A-Za-z0-9]{1,10}" />
                </label>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Field</th><th>Off</th><th>Optional</th><th>Required</th></tr></thead>
                    <tbody>
                      <tr className="is-muted"><td>Full name, email, department, terms and privacy notice</td><td colSpan={3} className="small">Always required</td></tr>
                      {Object.entries(data.fieldLabels).map(([k, label]) => (
                        <tr key={k}>
                          <td>{label}</td>
                          {['off', 'optional', 'required'].map((v) => (
                            <td key={v}><input type="radio" name={`f-${k}`} aria-label={`${label}: ${v}`} checked={draft.registration.fields[k] === v} onChange={() => setR('fields', { ...draft.registration.fields, [k]: v })} /></td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <label className="field"><span>Terms and privacy notice <small className="muted">— shown above the consent checkbox</small></span>
                  <textarea rows={5} value={draft.registration.termsText} onChange={(e) => setR('termsText', e.target.value)} maxLength={5000} />
                </label>
                <div className="actions"><button type="button" className="btn btn-primary" onClick={() => save('registration')} disabled={busy}>Save registration form</button></div>
              </section>
            )}
          </>
        );
      }}
    </Guard>
  );
}
