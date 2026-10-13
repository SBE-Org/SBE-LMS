import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useFlash } from '../../lib/flash.jsx';
import { useApi, useTitle } from '../../lib/useApi.js';
import { fmtDate, plural } from '../../lib/format.js';
import Icon from '../../components/Icon.jsx';
import { ActionButton, Crumbs, EnrolmentBadge, Guard, ProgressBar } from '../../components/ui.jsx';

function AssignForm({ data, onDone }) {
  const { course, teams, users, today } = data;
  const { flashAll, flash } = useFlash();
  const [teamIds, setTeamIds] = useState([]);
  const [userIds, setUserIds] = useState([]);
  const [autoEnrolNew, setAutoEnrolNew] = useState(true);
  const [dueDate, setDueDate] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => {
    const q = filter.toLowerCase();
    const out = new Map();
    for (const u of users) {
      const g = u.teamName || 'No team';
      if (q && !`${u.name} ${u.email} ${g}`.toLowerCase().includes(q)) continue;
      if (!out.has(g)) out.set(g, []);
      out.get(g).push(u);
    }
    return [...out.entries()];
  }, [users, filter]);

  const toggleTeam = (id, on) => setTeamIds((ids) => (on ? [...ids, id] : ids.filter((x) => x !== id)));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post(`/manage/courses/${course._id}/enrolments`, { teamIds, userIds, autoEnrolNew, dueDate });
      flashAll(res.messages);
      setTeamIds([]);
      setUserIds([]);
      setDueDate('');
      onDone();
    } catch (err) {
      flash('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card form">
      <h2>Assign this course</h2>
      <div className="grid-2">
        <div className="field">
          <span className="label">Teams</span>
          <div className="check-list">
            {teams.map((t) => (
              <label key={t._id} className="check">
                <input type="checkbox" checked={teamIds.includes(t._id)} onChange={(e) => toggleTeam(t._id, e.target.checked)} />{' '}
                <span>{t.name} <small className="muted">({t.members} people)</small></span>
              </label>
            ))}
            {!teams.length && <p className="muted small">No teams yet. <Link to="/admin/teams/new">Create one</Link>.</p>}
          </div>
          <label className="check small">
            <input type="checkbox" checked={autoEnrolNew} onChange={(e) => setAutoEnrolNew(e.target.checked)} /> <span>Also enrol people who join these teams later</span>
          </label>
        </div>
        <div className="field">
          <label htmlFor="user_ids" className="label">Individual people <small className="muted">(hold Ctrl / ⌘ to pick several)</small></label>
          <input type="search" className="filter-input" placeholder="Filter by name or team" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter people" />
          <select id="user_ids" multiple size={9} value={userIds} onChange={(e) => setUserIds([...e.target.selectedOptions].map((o) => o.value))}>
            {groups.map(([g, list]) => (
              <optgroup key={g} label={g}>
                {list.map((u) => <option key={u._id} value={u._id}>{u.name} — {u.roleLabel}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
      </div>
      <div className="actions">
        <label className="field inline-field"><span>Due date <small className="muted">(optional)</small></span><input type="date" min={today} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
        <button className="btn btn-primary" type="submit" disabled={busy}><Icon name="users" />Enrol</button>
      </div>
    </form>
  );
}

export default function Enrolments() {
  const { id } = useParams();
  const { meta } = useAuth();
  const { flash } = useFlash();
  const state = useApi(`/manage/courses/${id}/enrolments`);
  useTitle(state.data ? `Enrolments: ${state.data.course.title}` : 'Enrolments', meta.appName);

  const act = (fn) => async () => {
    try {
      const res = await fn();
      flash('success', res.message);
    } catch (e) {
      flash('error', e.message);
    }
    state.reload();
  };

  return (
    <Guard state={state}>
      {(data) => {
        const { course, enrolled, teamAssignments } = data;
        return (
          <>
            <Crumbs items={[['Manage courses', '/manage/courses'], [course.title, `/manage/courses/${course._id}`], ['Enrolments']]} />
            <div className="page-head">
              <div><h1>Enrolments</h1><p className="muted">{course.title} · {plural(enrolled.length, 'learner')} enrolled</p></div>
              <Link className="btn btn-ghost" to={`/reports/courses/${course._id}`}><Icon name="chart" />Course report</Link>
            </div>

            <AssignForm data={data} onDone={state.reload} />

            {teamAssignments.length > 0 && (
              <section className="section">
                <h2>Automatic team enrolment</h2>
                <div className="card list">
                  {teamAssignments.map((ta) => (
                    <div key={ta._id} className="list-row">
                      <span className="list-icon"><Icon name="team" /></span>
                      <span className="list-main"><strong>{ta.name}</strong><small className="muted">{ta.members} people{ta.dueDays ? ` · due ${ta.dueDays} days after joining` : ''}</small></span>
                      <ActionButton className="btn btn-ghost btn-sm" confirm={`Stop enrolling new members of ${ta.name} automatically?`} onAction={act(() => api.del(`/manage/team-courses/${ta._id}`))}>Stop</ActionButton>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="section">
              <h2>Enrolled learners</h2>
              {!enrolled.length ? (
                <div className="empty-state card"><p className="muted">Nobody is enrolled yet.</p></div>
              ) : (
                <div className="card table-wrap">
                  <table className="table">
                    <thead><tr><th>Learner</th><th>Team</th><th>Progress</th><th>Status</th><th>Due</th><th /></tr></thead>
                    <tbody>
                      {enrolled.map((e) => {
                        const pct = e.completedAt ? 100 : e.pct;
                        return (
                          <tr key={e._id}>
                            <td><Link to={`/reports/users/${e.userId}`}>{e.name}</Link><br /><small className="muted">{e.email}</small></td>
                            <td className="small">{e.teamName || '—'}</td>
                            <td className="w-progress"><ProgressBar pct={pct} /><small className="muted">{pct}%</small></td>
                            <td><EnrolmentBadge completedAt={e.completedAt} dueDate={e.dueDate} pct={e.pct} /></td>
                            <td className="small">{fmtDate(e.dueDate)}</td>
                            <td className="right">
                              <ActionButton className="icon-btn danger" label="Remove" confirm={`Remove ${e.name} from this course?`} onAction={act(() => api.del(`/manage/enrolments/${e._id}`))}>
                                <Icon name="x" />
                              </ActionButton>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        );
      }}
    </Guard>
  );
}
