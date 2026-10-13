import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { download, qs } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useFlash } from '../../lib/flash.jsx';
import { useApi, useTitle } from '../../lib/useApi.js';
import { capitalize, fmtDate } from '../../lib/format.js';
import Icon from '../../components/Icon.jsx';
import { Badge, Guard, ProgressBar } from '../../components/ui.jsx';

/** Team filter shared by the report pages. */
export function TeamFilter({ options, team, isTeamLead, onChange }) {
  if (!options?.length) return null;
  return (
    <form className="toolbar" onSubmit={(e) => e.preventDefault()}>
      <select value={team || ''} onChange={(e) => onChange(e.target.value)} aria-label="Team">
        <option value="">{isTeamLead ? 'All my teams' : 'All teams'}</option>
        {options.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
      </select>
    </form>
  );
}

const pctText = (v) => (v !== null && v !== undefined ? `${v}%` : '—');

/** Learner table that sorts when a column header is clicked. */
function LearnerTable({ learners }) {
  const [sort, setSort] = useState(null); // { key, asc }
  const cols = [
    ['name', 'Name'], ['team', 'Team'], ['completed', 'Courses', 'num'], ['progress', 'Average progress'],
    ['overdue', 'Overdue', 'num'], ['avgScore', 'Avg score', 'num'], ['lastLoginAt', 'Last sign-in'],
  ];
  const rows = [...learners];
  if (sort) {
    rows.sort((a, b) => {
      const x = a[sort.key] ?? '';
      const y = b[sort.key] ?? '';
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return sort.asc ? c : -c;
    });
  }
  return (
    <table className="table">
      <thead>
        <tr>
          {cols.map(([key, label, cls]) => (
            <th key={key} className={cls} data-sort="" onClick={() => setSort((s) => ({ key, asc: s?.key === key ? !s.asc : true }))}>{label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((l) => (
          <tr key={l._id}>
            <td><Link to={`/reports/users/${l._id}`}>{l.name}</Link></td>
            <td className="small">{l.team || '—'}</td>
            <td className="num">{l.completed}/{l.enrolled}</td>
            <td className="w-progress"><ProgressBar pct={l.progress} /><small className="muted">{l.progress}%</small></td>
            <td className={`num ${l.overdue ? 'text-danger' : ''}`}>{l.overdue}</td>
            <td className="num">{pctText(l.avgScore)}</td>
            <td className="small muted">{l.lastLoginAt ? fmtDate(l.lastLoginAt) : 'Never'}</td>
          </tr>
        ))}
        {!rows.length && <tr><td colSpan={7} className="muted center pad">No learners in this view.</td></tr>}
      </tbody>
    </table>
  );
}

export default function ReportsOverview() {
  const { meta } = useAuth();
  const { flash } = useFlash();
  const [params, setParams] = useSearchParams();
  const team = params.get('team') || '';
  const state = useApi(`/reports${qs({ team })}`);
  useTitle('Reports', meta.appName);

  const exportCsv = async (type) => {
    try {
      await download(`/reports/export${qs({ team, type })}`, `${type}.csv`);
    } catch (e) {
      flash('error', e.message);
    }
  };

  return (
    <Guard state={state}>
      {({ summary, courses, teams, learners, teamOptions, isTeamLead }) => (
        <>
          <div className="page-head">
            <div><h1>Reports</h1><p className="muted">{isTeamLead ? 'Training progress for the teams you lead.' : `Training progress across ${meta.company}.`}</p></div>
            <div className="actions">
              <button type="button" className="btn btn-ghost" onClick={() => exportCsv('enrolments')}><Icon name="download" />Progress CSV</button>
              <button type="button" className="btn btn-ghost" onClick={() => exportCsv('attempts')}><Icon name="download" />Quiz results CSV</button>
            </div>
          </div>

          {teamOptions.length ? (
            <TeamFilter options={teamOptions} team={team} isTeamLead={isTeamLead} onChange={(v) => setParams(v ? { team: v } : {})} />
          ) : isTeamLead ? (
            <div className="flash flash-info">You are not set as the lead of any team yet. Ask an administrator to set you as team lead on the team page.</div>
          ) : null}

          <div className="stats">
            <div className="stat"><span className="stat-label">Active learners</span><span className="stat-value">{summary.learners}</span><span className="stat-sub">{summary.enrolments} enrolments</span></div>
            <div className="stat"><span className="stat-label">Completion rate</span><span className="stat-value">{summary.completionRate}%</span><span className="stat-sub">{summary.completed} completed</span></div>
            <div className="stat"><span className="stat-label">Average quiz score</span><span className="stat-value">{pctText(summary.avgScore)}</span><span className="stat-sub">best attempt per quiz</span></div>
            <div className={`stat ${summary.overdue ? 'stat-alert' : ''}`}><span className="stat-label">Overdue</span><span className="stat-value">{summary.overdue}</span><span className="stat-sub">{summary.certificates} certificates issued</span></div>
          </div>

          <section className="section">
            <h2>By course</h2>
            <div className="card table-wrap">
              <table className="table">
                <thead><tr><th>Course</th><th className="num">Enrolled</th><th>Completion</th><th className="num">In progress</th><th className="num">Not started</th><th className="num">Overdue</th><th className="num">Avg score</th></tr></thead>
                <tbody>
                  {courses.map((c) => (
                    <tr key={c._id}>
                      <td><Link to={`/reports/courses/${c._id}${qs({ team })}`}><strong>{c.title}</strong></Link>{c.status !== 'published' && <> <Badge>{capitalize(c.status)}</Badge></>}</td>
                      <td className="num">{c.enrolled}</td>
                      <td className="w-progress"><ProgressBar pct={c.rate} /><small className="muted">{c.rate}% · {c.completed} done</small></td>
                      <td className="num">{c.inProgress}</td>
                      <td className="num">{c.notStarted}</td>
                      <td className={`num ${c.overdue ? 'text-danger' : ''}`}>{c.overdue}</td>
                      <td className="num">{pctText(c.avgScore)}</td>
                    </tr>
                  ))}
                  {!courses.length && <tr><td colSpan={7} className="muted center pad">No enrolments yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          {(teams.length > 1 || !team) && (
            <section className="section">
              <h2>By team</h2>
              <div className="card table-wrap">
                <table className="table">
                  <thead><tr><th>Team</th><th className="num">People</th><th className="num">Enrolments</th><th>Completion</th><th className="num">Overdue</th><th className="num">Avg score</th></tr></thead>
                  <tbody>
                    {teams.map((t) => (
                      <tr key={t._id || 'none'}>
                        <td>{t._id ? <Link to={`/reports?team=${t._id}`}><strong>{t.name}</strong></Link> : <span className="muted">{t.name}</span>}</td>
                        <td className="num">{t.people}</td>
                        <td className="num">{t.enrolled}</td>
                        <td className="w-progress"><ProgressBar pct={t.rate} /><small className="muted">{t.rate}%</small></td>
                        <td className={`num ${t.overdue ? 'text-danger' : ''}`}>{t.overdue}</td>
                        <td className="num">{pctText(t.avgScore)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="section">
            <div className="section-head"><h2>Learners</h2><span className="small muted">Overdue first, then least progress</span></div>
            <div className="card table-wrap"><LearnerTable learners={learners} /></div>
          </section>
        </>
      )}
    </Guard>
  );
}
