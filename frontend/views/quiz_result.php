<?php $passed = (int)$attempt['passed'] === 1; ?>
<nav class="crumbs"><a href="<?= e(url('/courses/' . $course['id'])) ?>"><?= e($course['title']) ?></a><span>/</span><a href="<?= e(url('/quizzes/' . $quiz['id'])) ?>"><?= e($quiz['title']) ?></a><span>/</span><span>Result</span></nav>

<section class="result-hero card <?= $passed ? 'is-pass' : 'is-fail' ?>">
  <div class="score-ring" style="--pct: <?= (int)$attempt['percent'] ?>"><span><?= (int)$attempt['percent'] ?>%</span></div>
  <div>
    <?php if (!$isOwner): ?><p class="eyebrow"><?= e($learner['name']) ?></p><?php endif; ?>
    <h1><?= $passed ? 'Passed' : 'Not passed this time' ?></h1>
    <p class="muted"><?= (int)$attempt['score'] ?> of <?= (int)$attempt['max_score'] ?> points · pass mark <?= (int)$quiz['pass_mark'] ?>% · submitted <?= e(fmt_datetime($attempt['submitted_at'])) ?></p>
    <div class="actions">
      <?php if ($isOwner && $passed && $courseComplete): ?>
        <a class="btn btn-primary" href="<?= e(url('/courses/' . $course['id'])) ?>"><?= icon('award') ?>Course complete — view certificate</a>
      <?php elseif ($isOwner && !$passed && $canRetry): ?>
        <?= post_button('/quizzes/' . $quiz['id'] . '/start', 'Try again ' . icon('arrow-right'), 'btn btn-primary') ?>
      <?php endif; ?>
      <a class="btn btn-ghost" href="<?= e(url($isOwner ? '/courses/' . $course['id'] : '/reports/users/' . $attempt['user_id'])) ?>"><?= $isOwner ? 'Back to course' : 'Back to learner report' ?></a>
    </div>
  </div>
</section>

<section class="section narrow-wide">
  <h2>Review</h2>
  <?php if (!$showAnswers): ?><p class="muted small">Your trainer has chosen not to show the correct answers for this quiz. You can see which questions you got right.</p><?php endif; ?>
  <?php foreach ($questions as $n => $q):
      $ans = $answers[(int)$q['id']] ?? ['correct' => 0, 'ids' => []];
      $ok = (int)$ans['correct'] === 1; ?>
    <div class="question card review <?= $ok ? 'is-right' : 'is-wrong' ?>">
      <div class="review-head">
        <span class="q-num"><?= $n + 1 ?></span>
        <span class="q-body"><?= nl2br(e($q['body'])) ?></span>
        <?= $ok ? badge('Correct', 'success') : badge('Incorrect', 'danger') ?>
      </div>
      <ul class="review-choices">
        <?php foreach ($q['choices'] as $c):
            $picked = in_array((int)$c['id'], $ans['ids'], true);
            $correct = (int)$c['is_correct'] === 1;
            $cls = $picked ? ($showAnswers ? ($correct ? 'picked-right' : 'picked-wrong') : 'picked') : ($showAnswers && $correct ? 'missed' : ''); ?>
          <li class="<?= $cls ?>">
            <span class="mark"><?= $picked ? '●' : '○' ?></span>
            <span><?= e($c['body']) ?></span>
            <?php if ($picked): ?><small class="muted">your answer</small><?php endif; ?>
            <?php if ($showAnswers && $correct && !$picked): ?><small class="text-success">correct answer</small><?php endif; ?>
          </li>
        <?php endforeach; ?>
      </ul>
      <?php if ($showAnswers && $q['explanation']): ?><p class="explanation"><?= e($q['explanation']) ?></p><?php endif; ?>
    </div>
  <?php endforeach; ?>
</section>
