import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtDateTime } from '../lib/format.js';
import Icon from './Icon.jsx';

/** Bell button with unread count and a dropdown of the latest notifications. */
export default function NotificationBell({ className = 'icon-btn' }) {
  const [data, setData] = useState({ notifications: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { pathname } = useLocation();

  const load = useCallback(() => api.get('/notifications').then(setData).catch(() => {}), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load, pathname]);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const markAll = async () => {
    await api.post('/notifications/read', {}).catch(() => {});
    load();
  };
  const markOne = (id) => api.post('/notifications/read', { ids: [id] }).then(load).catch(() => {});

  return (
    <div className="notif" ref={ref}>
      <button type="button" className={className} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true"
        aria-label={data.unread ? `Notifications, ${data.unread} unread` : 'Notifications'} title="Notifications">
        <Icon name="bell" />
        {data.unread > 0 && <span className="notif-count">{data.unread > 9 ? '9+' : data.unread}</span>}
      </button>
      {open && (
        <div className="notif-panel card" role="dialog" aria-label="Notifications">
          <div className="notif-head">
            <strong>Notifications</strong>
            {data.unread > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={markAll}>Mark all read</button>}
          </div>
          {!data.notifications.length && <p className="muted pad small">You have no notifications.</p>}
          <ul className="notif-list">
            {data.notifications.map((n) => {
              const body = (
                <>
                  <strong>{n.title}</strong>
                  {n.body && <span className="small">{n.body}</span>}
                  <small className="muted">{fmtDateTime(n.createdAt)}</small>
                </>
              );
              return (
                <li key={n._id} className={n.readAt ? '' : 'is-unread'}>
                  {n.link ? <Link to={n.link} onClick={() => !n.readAt && markOne(n._id)}>{body}</Link> : <div onClick={() => !n.readAt && markOne(n._id)}>{body}</div>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
