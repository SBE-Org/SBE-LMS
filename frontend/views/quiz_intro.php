<nav class="crumbs"><a href="<?= e(url('/courses')) ?>">Courses</a><span>/</span><a href="<?= e(url('/courses/' . $course['id'])) ?>"><?= e($course['title']) ?></a><span>/</span><span><?= e($quiz['title']) ?></span></nav>

<div class="quiz-intro card narrow-wide">
  <p class="eyebrow">Assessment</p>
  <h1><?= e($quiz['title']) ?></h1>
  <?php if ($quiz['description']): ?><p class="lead"><?= nl2br(e($quiz['description'])) ?></p><?php endif; ?>

  <dl class="facts">
    <div><dt>Questions</dt><dd><?= $questionCount ?></dd></div>
    <div><dt>Pass mark</dt><dd><?= (int)$quiz['pass_mark'] ?>%</dd></div>
    <div><dt>Time limit</dt><dd><?= $quiz['time_limit_min'] ? (int)$quiz['time_limit_min'] . ' min' : 'None' ?></dd></div>
    <div><dt>Attempts</dt><dd><?= (int)$quiz['max_attempts'] > 0 ? count($attempts) . ' of ' . (int)$quiz['max_attempts'] . ' used' : 'Unlimited' ?></dd></div>
  </dl>

  <?php if ($passed): ?>
    <div class="flash flash-success"><?= icon('check', 'icon icon-inline') ?> You passed this quiz. Your best score is <?= (int)max(array_column($attempts, 'percent')) ?>%.</div>
  <?php endif; ?>

  <div class="actions">
    <?php if (!$enrolled): ?>
      <p class="muted">You need to be enrolled in this course to take the quiz.</p>
    <?php elseif ($open): ?>
      <a class="btn btn-primary" href="<?= e(url('/attempts/' . $open['id'])) ?>">Resume attempt <?= icon('arrow-right') ?></a>
    <?php elseif ($questionCount === 0): ?>
      <p class="muted">This quiz has no questions yet.</p>
    <?php elseif ($remaining === 0): ?>
      <p class="text-danger">You have used all your attempts. Contact your trainer if you need another try.</p>
    <?php else: ?>
      <form method="post" action="<?= e(url('/quizzes/' . $quiz['id'] . '/start')) ?>"<?= $quiz['time_limit_min'] ? ' data-confirm="The ' . (int)$quiz['time_limit_min'] . '-minute timer starts as soon as you begin. Ready?"' : '' ?>>
        <?= csrf_field() ?>
        <button class="btn btn-primary" type="submit"><?= $attempts ? 'Try again' : 'Start quiz' ?> <?= icon('arrow-right') ?></button>
      </form>
      <?php if ($remaining !== null): ?><span class="small muted"><?= plural($remaining, 'attempt') ?> left</span><?php endif; ?>
    <?php endif; ?>
  </div>
</div>

<?php if ($attempts): ?>
<section class="section narrow-wide">
  <h2>Your attempts</h2>
  <div class="card table-wrap">
    <table class="table">
      <thead><tr><th>Date</th><th>Score</th><th>Result</th><th></th></tr></thead>
      <tbody>
      <?php foreach ($attempts as $a): ?>
        <tr>
          <td><?= e(fmt_datetime($a['submitted_at'])) ?></td>
          <td><?= (int)$a['score'] ?>/<?= (int)$a['max_score'] ?> (<?= (int)$a['percent'] ?>%)</td>
          <td><?= (int)$a['passed'] === 1 ? badge('Passed', 'success') : badge('Not passed', 'danger') ?></td>
          <td class="right"><a href="<?= e(url('/attempts/' . $a['id'] . '/result')) ?>">Review</a></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</section>
<?php endif; ?>
