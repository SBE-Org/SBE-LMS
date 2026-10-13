<?php $totalPoints = array_sum(array_map(fn($q) => (int)$q['points'], $questions)); ?>
<nav class="crumbs"><a href="<?= e(url('/manage/courses')) ?>">Manage courses</a><span>/</span><a href="<?= e(url('/manage/courses/' . $course['id'])) ?>"><?= e($course['title']) ?></a><span>/</span><span><?= e($quiz['title']) ?></span></nav>
<div class="page-head">
  <div>
    <h1><?= e($quiz['title']) ?></h1>
    <p class="muted"><?= plural(count($questions), 'question') ?> · <?= $totalPoints ?> points · pass <?= (int)$quiz['pass_mark'] ?>% · <?= $quiz['time_limit_min'] ? (int)$quiz['time_limit_min'] . ' min' : 'no time limit' ?> · <?= (int)$quiz['max_attempts'] ? plural((int)$quiz['max_attempts'], 'attempt') : 'unlimited attempts' ?></p>
  </div>
  <div class="actions">
    <a class="btn btn-ghost" href="<?= e(url('/reports/quizzes/' . $quiz['id'])) ?>"><?= icon('chart') ?>Results (<?= $attempts ?>)</a>
    <a class="btn btn-ghost" href="<?= e(url('/manage/quizzes/' . $quiz['id'] . '/edit')) ?>"><?= icon('edit') ?>Settings</a>
    <a class="btn btn-primary" href="<?= e(url('/manage/quizzes/' . $quiz['id'] . '/questions/new')) ?>"><?= icon('plus') ?>Add question</a>
  </div>
</div>

<?php if ($attempts): ?><div class="flash flash-info">Learners have already submitted <?= plural($attempts, 'attempt') ?>. Editing questions changes how new attempts are scored; past scores stay as they were.</div><?php endif; ?>

<?php if (!$questions): ?>
  <div class="empty-state card"><?= icon('quiz', 'icon icon-xl') ?><h3>No questions yet</h3><p class="muted">Add single-answer, multiple-answer or true/false questions.</p><a class="btn btn-primary" href="<?= e(url('/manage/quizzes/' . $quiz['id'] . '/questions/new')) ?>">Add the first question</a></div>
<?php endif; ?>

<?php foreach ($questions as $n => $q): ?>
  <div class="question card">
    <div class="review-head">
      <span class="q-num"><?= $n + 1 ?></span>
      <span class="q-body"><?= nl2br(e($q['body'])) ?></span>
      <span class="small muted nowrap"><?= ['single' => 'Single answer', 'multiple' => 'Multiple answers', 'truefalse' => 'True / false'][$q['type']] ?? '' ?> · <?= plural((int)$q['points'], 'pt') ?></span>
    </div>
    <ul class="review-choices">
      <?php foreach ($choices[(int)$q['id']] ?? [] as $c): ?>
        <li class="<?= (int)$c['is_correct'] === 1 ? 'picked-right' : '' ?>"><span class="mark"><?= (int)$c['is_correct'] === 1 ? '✓' : '○' ?></span><span><?= e($c['body']) ?></span></li>
      <?php endforeach; ?>
    </ul>
    <div class="row-actions end">
      <a class="btn btn-ghost btn-sm" href="<?= e(url('/manage/questions/' . $q['id'] . '/edit')) ?>"><?= icon('edit') ?>Edit</a>
      <?= post_button('/manage/questions/' . $q['id'] . '/delete', icon('trash') . 'Delete', 'btn btn-ghost btn-sm danger', 'Delete this question?') ?>
    </div>
  </div>
<?php endforeach; ?>
