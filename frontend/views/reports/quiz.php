<nav class="crumbs"><a href="<?= e(url('/reports')) ?>">Reports</a><span>/</span><a href="<?= e(url('/reports/courses/' . $course['id'])) ?>"><?= e($course['title']) ?></a><span>/</span><span><?= e($quiz['title']) ?></span></nav>
<div class="page-head">
  <div><h1><?= e($quiz['title']) ?></h1><p class="muted">Pass mark <?= (int)$quiz['pass_mark'] ?>%</p></div>
  <?php if (is_staff()): ?><a class="btn btn-ghost" href="<?= e(url('/manage/quizzes/' . $quiz['id'])) ?>"><?= icon('edit') ?>Edit questions</a><?php endif; ?>
</div>

<div class="stats">
  <div class="stat"><span class="stat-label">Learners tried</span><span class="stat-value"><?= $stats['learners'] ?></span><span class="stat-sub"><?= $stats['attempts'] ?> attempts</span></div>
  <div class="stat"><span class="stat-label">Pass rate</span><span class="stat-value"><?= $stats['pass_rate'] ?>%</span><span class="stat-sub"><?= $stats['passed'] ?> passed</span></div>
  <div class="stat"><span class="stat-label">Average score</span><span class="stat-value"><?= $stats['avg'] !== null ? $stats['avg'] . '%' : '—' ?></span><span class="stat-sub">all attempts</span></div>
</div>

<section class="section">
  <div class="section-head"><h2>Question analysis</h2><span class="small muted">Questions most people get wrong may need better training material — or clearer wording.</span></div>
  <div class="card table-wrap">
    <table class="table">
      <thead><tr><th>#</th><th>Question</th><th class="num">Answered</th><th>Answered correctly</th></tr></thead>
      <tbody>
      <?php foreach ($questions as $n => $qu): ?>
        <tr>
          <td class="muted"><?= $n + 1 ?></td>
          <td><?= e(mb_strimwidth($qu['body'], 0, 140, '…')) ?></td>
          <td class="num"><?= (int)$qu['answered'] ?></td>
          <td class="w-progress"><?php if ($qu['rate'] !== null): ?><?= progress_bar($qu['rate']) ?><small class="<?= $qu['rate'] < 50 ? 'text-danger' : 'muted' ?>"><?= $qu['rate'] ?>%<?= $qu['rate'] < 50 ? ' — review this' : '' ?></small><?php else: ?><span class="muted">—</span><?php endif; ?></td>
        </tr>
      <?php endforeach; ?>
      <?php if (!$questions): ?><tr><td colspan="4" class="muted center pad">No data yet.</td></tr><?php endif; ?>
      </tbody>
    </table>
  </div>
</section>

<section class="section">
  <h2>Recent attempts</h2>
  <div class="card table-wrap">
    <table class="table">
      <thead><tr><th>Learner</th><th>Team</th><th>Submitted</th><th class="num">Score</th><th>Result</th><th></th></tr></thead>
      <tbody>
      <?php foreach ($attempts as $a): ?>
        <tr>
          <td><a href="<?= e(url('/reports/users/' . $a['user_id'])) ?>"><?= e($a['name']) ?></a></td>
          <td class="small"><?= e($a['team_name'] ?: '—') ?></td>
          <td class="small"><?= e(fmt_datetime($a['submitted_at'])) ?></td>
          <td class="num"><?= (int)$a['percent'] ?>%</td>
          <td><?= (int)$a['passed'] === 1 ? badge('Passed', 'success') : badge('Not passed', 'danger') ?></td>
          <td class="right"><a href="<?= e(url('/attempts/' . $a['id'] . '/result')) ?>">View answers</a></td>
        </tr>
      <?php endforeach; ?>
      <?php if (!$attempts): ?><tr><td colspan="6" class="muted center pad">No attempts yet.</td></tr><?php endif; ?>
      </tbody>
    </table>
  </div>
</section>
