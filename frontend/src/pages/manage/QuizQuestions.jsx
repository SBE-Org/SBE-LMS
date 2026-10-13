import { Fragment } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useFlash } from '../../lib/flash.jsx';
import { useApi, useTitle } from '../../lib/useApi.js';
import { plural } from '../../lib/format.js';
import Icon from '../../components/Icon.jsx';
import { ActionButton, Crumbs, EmptyState, Guard } from '../../components/ui.jsx';

const TYPE_LABELS = { single: 'Single answer', multiple: 'Multiple answers', truefalse: 'True / false' };

export default function QuizQuestions() {
  const { id } = useParams();
  const { meta } = useAuth();
  const { flash } = useFlash();
  const state = useApi(`/manage/quizzes/${id}`);
  useTitle(state.data?.quiz.title, meta.appName);

  const remove = (qid) => async () => {
    try {
      const res = await api.del(`/manage/questions/${qid}`);
      flash('success', res.message);
    } catch (e) {
      flash('error', e.message);
    }
    state.reload();
  };

  return (
    <Guard state={state}>
      {({ quiz, course, questions, attempts }) => {
        const totalPoints = questions.reduce((s, q) => s + q.points, 0);
        return (
          <>
            <Crumbs items={[['Manage courses', '/manage/courses'], [course.title, `/manage/courses/${course._id}`], [quiz.title]]} />
            <div className="page-head">
              <div>
                <h1>{quiz.title}</h1>
                <p className="muted">
                  {plural(questions.length, 'question')} · {totalPoints} points · pass {quiz.passMark}% · {quiz.timeLimitMin ? `${quiz.timeLimitMin} min` : 'no time limit'} · {quiz.maxAttempts ? plural(quiz.maxAttempts, 'attempt') : 'unlimited attempts'}
                </p>
              </div>
              <div className="actions">
                <Link className="btn btn-ghost" to={`/reports/quizzes/${quiz._id}`}><Icon name="chart" />Results ({attempts})</Link>
                <Link className="btn btn-ghost" to={`/manage/quizzes/${quiz._id}/edit`}><Icon name="edit" />Settings</Link>
                <Link className="btn btn-primary" to={`/manage/quizzes/${quiz._id}/questions/new`}><Icon name="plus" />Add question</Link>
              </div>
            </div>
            {attempts > 0 && <div className="flash flash-info">Learners have already submitted {plural(attempts, 'attempt')}. Editing questions changes how new attempts are scored; past scores stay as they were.</div>}
            {!questions.length && (
              <EmptyState icon="quiz" title="No questions yet">
                <p className="muted">Add single-answer, multiple-answer or true/false questions.</p>
                <Link className="btn btn-primary" to={`/manage/quizzes/${quiz._id}/questions/new`}>Add the first question</Link>
              </EmptyState>
            )}
            {questions.map((q, n) => (
              <div key={q._id} className="question card">
                <div className="review-head">
                  <span className="q-num">{n + 1}</span>
                  <span className="q-body">{q.body.split('\n').map((l, i) => <Fragment key={i}>{i > 0 && <br />}{l}</Fragment>)}</span>
                  <span className="small muted nowrap">{TYPE_LABELS[q.type]} · {plural(q.points, 'pt')}</span>
                </div>
                <ul className="review-choices">
                  {q.choices.map((c) => (
                    <li key={c._id} className={c.isCorrect ? 'picked-right' : ''}><span className="mark">{c.isCorrect ? '✓' : '○'}</span><span>{c.body}</span></li>
                  ))}
                </ul>
                <div className="row-actions end">
                  <Link className="btn btn-ghost btn-sm" to={`/manage/questions/${q._id}/edit`}><Icon name="edit" />Edit</Link>
                  <ActionButton className="btn btn-ghost btn-sm danger" confirm="Delete this question?" onAction={remove(q._id)}><Icon name="trash" />Delete</ActionButton>
                </div>
              </div>
            ))}
          </>
        );
      }}
    </Guard>
  );
}
