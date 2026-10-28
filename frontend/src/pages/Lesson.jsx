import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api, apiUrl } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useFlash } from '../lib/flash.jsx';
import { useApi, useTitle } from '../lib/useApi.js';
import { fileKind, parseVideoUrl } from '../lib/format.js';
import Icon from '../components/Icon.jsx';
import RichText from '../components/RichText.jsx';
import { Crumbs, Guard, LessonIcon, ProgressBar } from '../components/ui.jsx';

function VideoEmbed({ url }) {
  const v = parseVideoUrl(url);
  if (!v) return null;
  if (v.kind === 'file') return <div className="video"><video controls preload="metadata" src={v.src} /></div>;
  return (
    <div className="video">
      <iframe src={v.src} title="Lesson video" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen loading="lazy" />
    </div>
  );
}

/** Extra links of a lesson. They open in a new tab, so the lesson stays open. */
function LessonLinks({ links }) {
  if (!links?.length) return null;
  return (
    <section className="lesson-links-view">
      <h2>Links</h2>
      <ul>
        {links.map((x, i) => (
          <li key={i}>
            <a href={x.url} target="_blank" rel="noopener noreferrer"><Icon name="link" /><span>{x.title || x.url}</span></a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LessonFile({ lesson }) {
  const url = apiUrl(lesson.fileUrl);
  const kind = fileKind(lesson.file.name);
  return (
    <>
      {kind === 'video' && <div className="video"><video controls preload="metadata" src={url} /></div>}
      {kind === 'audio' && <audio controls preload="metadata" src={url} className="audio" />}
      {kind === 'image' && <img className="lesson-image" src={url} alt={lesson.title} />}
      {kind === 'pdf' && <iframe className="pdf-frame" src={url} title={lesson.file.name} />}
      <p className="file-row">
        <Icon name="file" /> <span>{lesson.file.name}</span>
        <a className="btn btn-ghost btn-sm" href={`${url}&download=1`}><Icon name="download" />Download</a>
      </p>
    </>
  );
}

export default function LessonPage() {
  const { id } = useParams();
  const { meta } = useAuth();
  const { flash } = useFlash();
  const navigate = useNavigate();
  const state = useApi(`/lessons/${id}`);
  const [busy, setBusy] = useState(false);
  useTitle(state.data?.lesson.title, meta.appName);

  // Not enrolled in an open course: send them to the course page to join first
  const notEnrolled = state.error?.code === 'NOT_ENROLLED';
  useEffect(() => {
    if (notEnrolled) flash('info', 'Join the course to start learning.');
  }, [notEnrolled, flash]);
  if (notEnrolled) return <Navigate to={`/courses/${state.error.body.courseId}`} replace />;

  const complete = async (nextId) => {
    setBusy(true);
    try {
      const res = await api.post(`/lessons/${id}/complete`, { next: nextId || '' });
      if (res.finished) flash('success', res.message);
      navigate(res.redirect);
    } catch (e) {
      flash('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Guard state={state}>
      {({ lesson, course, outline, prev, next, done, enrolled, progress }) => (
        <>
          <Crumbs items={[['Courses', '/courses'], [course.title, `/courses/${course._id}`], [lesson.moduleTitle]]} />
          <div className="lesson-layout">
            <article className="lesson card">
              <header className="lesson-head">
                <p className="eyebrow">{lesson.moduleTitle}</p>
                <h1>{lesson.title}</h1>
                {lesson.durationMin > 0 && <p className="muted small"><Icon name="clock" className="icon icon-inline" /> {lesson.durationMin} min</p>}
              </header>

              {lesson.videoUrl && <VideoEmbed url={lesson.videoUrl} />}
              {lesson.audioUrl && <audio controls preload="metadata" src={lesson.audioUrl} className="audio" />}
              {lesson.fileUrl && <LessonFile lesson={lesson} />}
              <RichText text={lesson.body} />
              <LessonLinks links={lesson.links} />

              <footer className="lesson-foot">
                {prev ? <Link className="btn btn-ghost" to={`/lessons/${prev._id}`}><Icon name="arrow-left" />Previous</Link> : <span />}
                {enrolled && !done ? (
                  <button className="btn btn-primary" type="button" disabled={busy} onClick={() => complete(next?._id)}>
                    <Icon name="check" />Mark complete{next ? ' & continue' : ''}
                  </button>
                ) : next ? (
                  <Link className="btn btn-primary" to={`/lessons/${next._id}`}>Next lesson <Icon name="arrow-right" /></Link>
                ) : outline.next?.type === 'quiz' ? (
                  <Link className="btn btn-primary" to={`/quizzes/${outline.next.id}`}>Take the quiz <Icon name="arrow-right" /></Link>
                ) : (
                  <Link className="btn btn-primary" to={`/courses/${course._id}`}>Back to course</Link>
                )}
              </footer>
              {done && <p className="center small text-success"><Icon name="check" className="icon icon-inline" /> You completed this lesson.</p>}
            </article>

            <aside className="lesson-side card">
              <div className="lesson-side-head">
                <strong>{course.title}</strong>
                {enrolled && <><ProgressBar pct={progress.pct} /><small className="muted">{progress.pct}% complete</small></>}
              </div>
              {outline.modules.filter((m) => m.lessons.length).map((m) => (
                <div key={m._id}>
                  <p className="side-module">{m.title}</p>
                  <ol className="outline outline-compact">
                    {m.lessons.map((l) => {
                      const current = String(l._id) === String(lesson._id);
                      return (
                        <li key={l._id} className={`${l.completedAt ? 'is-done' : ''} ${current ? 'is-current' : ''}`}>
                          <Link to={`/lessons/${l._id}`} aria-current={current ? 'page' : undefined}>
                            <span className="status-dot">{l.completedAt ? <Icon name="check" /> : <LessonIcon type={l.type} />}</span>
                            <span className="outline-title">{l.title}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
              {outline.quizzes.length > 0 && (
                <>
                  <p className="side-module">Assessments</p>
                  <ol className="outline outline-compact">
                    {outline.quizzes.map((q) => (
                      <li key={q._id} className={q.passed ? 'is-done' : ''}>
                        <Link to={`/quizzes/${q._id}`}>
                          <span className="status-dot">{q.passed ? <Icon name="check" /> : <Icon name="quiz" />}</span>
                          <span className="outline-title">{q.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </aside>
          </div>
        </>
      )}
    </Guard>
  );
}
