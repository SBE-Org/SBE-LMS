import { Fragment } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useApi, useTitle } from '../lib/useApi.js';
import { fmtDateTime } from '../lib/format.js';
import Icon from '../components/Icon.jsx';
import { Badge, Crumbs, Guard } from '../components/ui.jsx';
import { useStartQuiz } from './QuizIntro.jsx';

export default function QuizResult() {
  const { id } = useParams();
  const { meta } = useAuth();
  const state = useApi(`/attempts/${id}/result`);
  const { start, busy } = useStartQuiz();
  useTitle(state.data?.quiz ? `Result: ${state.data.quiz.title}` : 'Result', meta.appName);
  if (state.data?.status === 'in_progress') return <Navigate to={`/attempts/${id}`} replace />;

  return (
    <Guard state={state}>
      {({ attempt, quiz, course, learner, isOwner, showAnswers, canRetry, courseComplete, answers, questions }) => (
        <>
          <Crumbs items={[[course.title, `/courses/${course._id}`], [quiz.title, `/quizzes/${quiz._id}`], ['Result']]} />
          <section className={`result-hero card ${attempt.passed ? 'is-pass' : 'is-fail'}`}>
            <div className="score-ring" style={{ '--pct': attempt.percent }}><span>{attempt.percent}%</span></div>
            <div>
              {!isOwner && <p className="eyebrow">{learner?.name}</p>}
              <h1>{attempt.passed ? 'Passed' : 'Not passed this time'}</h1>
              <p className="muted">{attempt.score} of {attempt.maxScore} points · pass mark {quiz.passMark}% · submitted {fmtDateTime(attempt.submittedAt)}</p>
              <div className="actions">
                {isOwner && attempt.passed && courseComplete ? (
                  <Link className="btn btn-primary" to={`/courses/${course._id}`}><Icon name="award" />Course complete — view certificate</Link>
                ) : isOwner && !attempt.passed && canRetry ? (
                  <button className="btn btn-primary" type="button" disabled={busy} onClick={() => start({ ...quiz, timeLimitMin: null })}>
                    Try again <Icon name="arrow-right" />
                  </button>
                ) : null}
                <Link className="btn btn-ghost" to={isOwner ? `/courses/${course._id}` : `/reports/users/${attempt.user}`}>
                  {isOwner ? 'Back to course' : 'Back to learner report'}
                </Link>
              </div>
            </div>
          </section>

          <section className="section narrow-wide">
            <h2>Review</h2>
            {!showAnswers && <p className="muted small">Your trainer has chosen not to show the correct answers for this quiz. You can see which questions you got right.</p>}
            {questions.map((q, n) => {
              const ans = answers[q._id] || { correct: false, selected: [] };
              return (
                <div key={q._id} className={`question card review ${ans.correct ? 'is-right' : 'is-wrong'}`}>
                  <div className="review-head">
                    <span className="q-num">{n + 1}</span>
                    <span className="q-body">{q.body.split('\n').map((l, i) => <Fragment key={i}>{i > 0 && <br />}{l}</Fragment>)}</span>
                    {ans.correct ? <Badge tone="success">Correct</Badge> : <Badge tone="danger">Incorrect</Badge>}
                  </div>
                  <ul className="review-choices">
                    {q.choices.map((c) => {
                      const picked = ans.selected.includes(String(c._id));
                      const correct = !!c.isCorrect;
                      const cls = picked ? (showAnswers ? (correct ? 'picked-right' : 'picked-wrong') : 'picked') : showAnswers && correct ? 'missed' : '';
                      return (
                        <li key={c._id} className={cls}>
                          <span className="mark">{picked ? '●' : '○'}</span>
                          <span>{c.body}</span>
                          {picked && <small className="muted">your answer</small>}
                          {showAnswers && correct && !picked && <small className="text-success">correct answer</small>}
                        </li>
                      );
                    })}
                  </ul>
                  {showAnswers && q.explanation && <p className="explanation">{q.explanation}</p>}
                </div>
              );
            })}
          </section>
        </>
      )}
    </Guard>
  );
}
