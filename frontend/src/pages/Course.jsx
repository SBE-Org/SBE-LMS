import { Fragment } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth, canBuild } from '../lib/auth.jsx';
import Logo from '../components/Logo.jsx';
import { useFlash } from '../lib/flash.jsx';
import { useApi, useTitle } from '../lib/useApi.js';
import { fmtDate, plural } from '../lib/format.js';
import Icon from '../components/Icon.jsx';
import { ActionButton, Badge, Crumbs, Guard, LessonIcon, ProgressBar } from '../components/ui.jsx';

const nextLink = (n) => `${n.type === 'quiz' ? '/quizzes/' : '/lessons/'}${n.id}`;

export default function CoursePage() {
  const { id } = useParams();
  const { user, meta } = useAuth();
  const { flash } = useFlash();
  const state = useApi(`/courses/${id}`);
  useTitle(state.data?.course.title, meta.appName);

  const join = async () => {
    try {
      const res = await api.post(`/courses/${id}/enrol`);
      flash('success', res.message);
      state.reload();
    } catch (e) {
      flash('error', e.message);
    }
  };

  return (
    <Guard state={state}>
      {({ course, enrolment, outline, progress, certificate }) => {
        const enrolled = !!enrolment;
        const next = outline.next;
        const minutes = outline.lessons.reduce((s, l) => s + (l.durationMin || 0), 0);
        const staff = canBuild(user);
        return (
          <>
            <Logo placement="coursePages" className="course-logo" nameFallback={false} />
            <Crumbs items={[['Courses', '/courses'], [course.title]]} />
            {!enrolled && staff && (
              <div className="flash flash-info">
                Preview mode: you are not enrolled, so progress is not recorded.{' '}
                {course.status !== 'published' && <>This course is a <strong>{course.status}</strong> and hidden from learners. </>}
                <Link to={`/manage/courses/${course._id}`}>Edit course</Link>
              </div>
            )}

            <section className="course-hero card">
              <div className="course-hero-main">
                <span className="chip">{course.category || 'General'}</span>
                <h1>{course.title}</h1>
                <p className="lead">{course.summary.split('\n').map((l, i) => <Fragment key={i}>{i > 0 && <br />}{l}</Fragment>)}</p>
                <p className="meta muted small">
                  <Icon name="book" className="icon icon-inline" /> {plural(outline.lessons.length, 'lesson')}
                  {' · '}<Icon name="quiz" className="icon icon-inline" /> {plural(outline.quizzes.length, 'quiz', 'quizzes')}
                  {minutes > 0 && <> · <Icon name="clock" className="icon icon-inline" /> about {minutes} min</>}
                  {enrolment?.dueDate && <> · Due {fmtDate(enrolment.dueDate)}</>}
                </p>
              </div>
              <div className="course-hero-side">
                {certificate ? (
                  <>
                    <div className="cert-banner">
                      <Icon name="award" className="icon icon-lg" />
                      <div><strong>Course completed</strong><small>Certificate earned {fmtDate(certificate.issuedAt)}</small></div>
                    </div>
                    <Link className="btn btn-primary btn-block" to={`/certificates/${certificate.code}`}><Icon name="award" />View certificate</Link>
                  </>
                ) : enrolled ? (
                  <>
                    <div className="big-pct">{progress.pct}<span>%</span></div>
                    <ProgressBar pct={progress.pct} />
                    <p className="small muted">{progress.done} of {progress.total} items complete</p>
                    {enrolment.completedAt ? (
                      <Badge tone="success">Completed</Badge>
                    ) : next ? (
                      <Link className="btn btn-primary btn-block" to={nextLink(next)}>{progress.pct > 0 ? 'Continue' : 'Start course'} <Icon name="arrow-right" /></Link>
                    ) : null}
                  </>
                ) : course.selfEnrol ? (
                  <>
                    <p className="muted small">This course is open to everyone.</p>
                    <ActionButton className="btn btn-primary btn-block" onAction={join}>Join this course</ActionButton>
                  </>
                ) : null}
              </div>
            </section>

            <section className="section">
              <h2>Course content</h2>
              {!outline.modules.length && !outline.quizzes.length && <div className="empty-state card"><p className="muted">This course has no content yet.</p></div>}
              {outline.modules.map((m, i) => {
                if (!m.lessons.length && !staff) return null;
                const mDone = m.lessons.filter((l) => l.completedAt).length;
                return (
                  <div key={m._id} className="module card">
                    <div className="module-head">
                      <span className="module-num">{i + 1}</span>
                      <h3>{m.title}</h3>
                      {enrolled && m.lessons.length > 0 && <span className="small muted">{mDone}/{m.lessons.length}</span>}
                    </div>
                    <ol className="outline">
                      {m.lessons.map((l) => (
                        <li key={l._id} className={`${l.completedAt ? 'is-done' : ''} ${next?.type === 'lesson' && next.id === String(l._id) ? 'is-next' : ''}`}>
                          <Link to={`/lessons/${l._id}`}>
                            <span className="status-dot">{l.completedAt ? <Icon name="check" /> : <LessonIcon type={l.type} />}</span>
                            <span className="outline-title">{l.title}</span>
                            {l.durationMin > 0 && <span className="small muted">{l.durationMin} min</span>}
                          </Link>
                        </li>
                      ))}
                      {!m.lessons.length && <li className="muted small pad">No lessons in this module yet.</li>}
                    </ol>
                  </div>
                );
              })}
              {outline.quizzes.length > 0 && (
                <div className="module card">
                  <div className="module-head"><span className="module-num"><Icon name="quiz" /></span><h3>Assessments</h3></div>
                  <ol className="outline">
                    {outline.quizzes.map((q) => (
                      <li key={q._id} className={`${q.passed ? 'is-done' : ''} ${next?.type === 'quiz' && next.id === String(q._id) ? 'is-next' : ''}`}>
                        <Link to={`/quizzes/${q._id}`}>
                          <span className="status-dot">{q.passed ? <Icon name="check" /> : <Icon name="quiz" />}</span>
                          <span className="outline-title">{q.title}</span>
                          <span className="small muted">{q.best !== null && <>Best {q.best}% · </>}Pass {q.passMark}%</span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </section>
          </>
        );
      }}
    </Guard>
  );
}
