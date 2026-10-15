import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { pctClass, todayYmd } from '../lib/format.js';

export function ProgressBar({ pct = 0, label }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className={`progress ${pctClass(p)}`} role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${p}%` }} />
    </div>
  );
}

export const Badge = ({ tone = 'neutral', children }) => <span className={`badge badge-${tone}`}>{children}</span>;

export function EnrolmentBadge({ completedAt, dueDate, pct }) {
  if (completedAt) return <Badge tone="success">Completed</Badge>;
  if (dueDate && dueDate < todayYmd()) return <Badge tone="danger">Overdue</Badge>;
  return pct > 0 ? <Badge tone="info">In progress</Badge> : <Badge>Not started</Badge>;
}

export const LessonIcon = ({ type }) => <Icon name={{ video: 'play', file: 'file' }[type] || 'text'} />;

export const STATUS_TONE = { published: 'success', draft: 'warning', archived: 'neutral' };

/** Breadcrumbs: items are [label, to] pairs; the last one is plain text. */
export function Crumbs({ items }) {
  return (
    <nav className="crumbs">
      {items.map(([label, to], i) => (
        <Fragment key={i}>
          {i > 0 && <span>/</span>}
          {to ? <Link to={to}>{label}</Link> : <span>{label}</span>}
        </Fragment>
      ))}
    </nav>
  );
}

export function Errors({ errors }) {
  if (!errors?.length) return null;
  return errors.map((e, i) => (
    <div key={i} className="flash flash-error" role="alert">{e}</div>
  ));
}

export function Loading() {
  return <div className="empty-state" aria-busy="true"><p className="muted">Loading…</p></div>;
}

const TITLES = { 0: 'Connection problem', 401: 'Please sign in', 403: 'Access denied', 404: 'Page not found', 419: 'Session expired', 500: 'Something went wrong' };

export function ErrorPage({ status = 404, message, code }) {
  if (code === 'REGISTRATION_NOT_APPROVED') {
    return (
      <div className="empty-state error-page">
        <Icon name="lock" className="icon icon-xl" />
        <h1>Registration not approved yet</h1>
        {message && <p className="muted">{message}</p>}
        <p><Link className="btn btn-primary" to="/registration"><Icon name="clipboard" />View my registration</Link></p>
      </div>
    );
  }
  return (
    <div className="empty-state error-page">
      <p className="error-code">{status || '!'}</p>
      <h1>{TITLES[status] || 'Error'}</h1>
      {message && <p className="muted">{message}</p>}
      <p><Link className="btn btn-primary" to="/"><Icon name="home" />Back to dashboard</Link></p>
    </div>
  );
}

/** Registration status badge (students). */
export function RegistrationBadge({ status }) {
  const map = { pending: ['Pending review', 'warning'], correction_requested: ['Correction requested', 'info'], approved: ['Approved', 'success'], rejected: ['Rejected', 'danger'] };
  if (!map[status]) return null;
  return <Badge tone={map[status][1]}>{map[status][0]}</Badge>;
}

/** Shows Loading or ErrorPage while a useApi() request is pending or failed. */
export function Guard({ state, children }) {
  if (state.error) return <ErrorPage status={state.error.status} message={state.error.message} code={state.error.code} />;
  if (state.loading || !state.data) return <Loading />;
  return children(state.data);
}

/**
 * A button that runs an async action, with an optional confirm() prompt.
 * Mirrors the small POST forms of the original (delete, move, enrol…).
 */
export function ActionButton({ onAction, confirm: confirmText, className = 'btn btn-ghost', label, title, children, disabled }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    try {
      await onAction();
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className={className} onClick={run} disabled={busy || disabled} aria-label={label} title={title || label}>
      {children}
    </button>
  );
}

export function EmptyState({ icon, title, children }) {
  return (
    <div className="empty-state card">
      {icon && <Icon name={icon} className="icon icon-xl" />}
      {title && <h3>{title}</h3>}
      {children}
    </div>
  );
}
