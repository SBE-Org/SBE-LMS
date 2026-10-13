import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { qs } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useApi, useTitle } from '../lib/useApi.js';
import { plural } from '../lib/format.js';
import Icon from '../components/Icon.jsx';
import { Badge, EmptyState, EnrolmentBadge, Guard, ProgressBar } from '../components/ui.jsx';

export default function Catalog() {
  const { meta } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const category = params.get('category') || '';
  const [search, setSearch] = useState(q);
  const state = useApi(`/courses${qs({ q, category })}`);
  useTitle('Courses', meta.appName);
  useEffect(() => setSearch(q), [q]);

  const apply = (next) => setParams(Object.fromEntries(Object.entries({ q, category, ...next }).filter(([, v]) => v)));

  return (
    <>
      <div className="page-head">
        <div><h1>Courses</h1><p className="muted">Your assigned courses and courses open to everyone.</p></div>
      </div>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); apply({ q: search.trim() }); }}>
        <label className="search">
          <Icon name="search" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search courses" aria-label="Search courses" />
        </label>
        <select value={category} onChange={(e) => apply({ category: e.target.value })} aria-label="Category">
          <option value="">All categories</option>
          {(state.data?.categories || []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="btn btn-ghost" type="submit">Search</button>
      </form>

      <Guard state={state}>
        {({ courses }) =>
          !courses.length ? (
            <EmptyState icon="book" title="No courses found">
              <p className="muted">{q || category ? 'Try a different search.' : 'No courses have been assigned to you yet.'}</p>
            </EmptyState>
          ) : (
            <div className="course-grid">
              {courses.map((c) => (
                <div key={c._id} className="course-card card">
                  <div className="course-card-top">
                    <span className="chip">{c.category || 'General'}</span>
                    {c.enrolmentId ? <EnrolmentBadge completedAt={c.completedAt} dueDate={c.dueDate} pct={c.pct} /> : <Badge tone="accent">Open to join</Badge>}
                  </div>
                  <h3><Link className="stretched" to={`/courses/${c._id}`}>{c.title}</Link></h3>
                  <p className="muted clamp">{c.summary}</p>
                  <div className="course-card-foot">
                    {c.enrolmentId ? (
                      <><ProgressBar pct={c.pct} /><span className="small muted">{c.pct}% complete</span></>
                    ) : (
                      <span className="small muted">{plural(c.items, 'lesson or quiz', 'lessons and quizzes')}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </Guard>
    </>
  );
}
