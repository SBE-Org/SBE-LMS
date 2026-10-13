<?php
$q = $team ? ['team' => $team] : [];
$done = count(array_filter($enrolments, fn($e) => $e['completed_at']));
$overdue = count(array_filter($enrolments, fn($e) => $e['overdue']));
?>
<nav class="crumbs"><a href="<?= e(url('/reports', $q)) ?>">Reports</a><span>/</span><span><?= e($course['title']) ?></span></nav>
<div class="page-head">
  <div><h1><?= e($course['title']) ?></h1><p class="muted"><?= (int)$totals['lessons'] ?> lessons · <?= (int)$totals['quizzes'] ?> quizzes</p></div>
  <?php if (is_staff()): ?><a class="btn btn-ghost" href="<?= e(url('/manage/courses/' . $course['id'] . '/enrolments')) ?>"><?= icon('users') ?>Manage enrolments</a><?php endif; ?>
</div>

<?php if ($teamOptions): ?>
<form class="toolbar" method="get" action="<?= e(url('/reports/courses/' . $course['id'])) ?>">
  <select name="team" aria-label="Team" data-autosubmit>
    <option value=""><?= has_role('team_lead') ? 'All my teams' : 'All teams' ?></option>
    <?php foreach ($teamOptions as $t): ?><option value="<?= (int)$t['id'] ?>" <?= $team === (int)$t['id'] ? 'selected' : '' ?>><?= e($t['name']) ?></option><?php endforeach; ?>
  </select>
</form>
<?php endif; ?>

<div class="stats">
  <div class="stat"><span class="stat-label">Enrolled</span><span class="stat-value"><?= count($enrolments) ?></span></div>
  <div class="stat"><span class="stat-label">Completed</span><span class="stat-value"><?= $done ?></span><span class="stat-sub"><?= count($enrolments) ? round($done * 100 / count($enrolments)) : 0 ?>% completion</span></div>
  <div class="stat <?= $overdue ? 'stat-alert' : '' ?>"><span class="stat-label">Overdue</span><span class="stat-value"><?= $overdue ?></span></div>
</div>

<?php if ($quizzes): ?>
<section class="section">
  <h2>Quizzes</h2>
  <div class="card table-wrap">
    <table class="table">
      <thead><tr><th>Quiz</th><th class="num">Learners tried</th><th>Pass rate</th><th class="num">Avg score</th><th class="num">Attempts</th><th></th></tr></thead>
      <tbody>
      <?php foreach ($quizzes as $qz): $s = $qz['stats']; ?>
        <tr>
          <td><strong><?= e($qz['title']) ?></strong><br><small class="muted">pass mark <?= (int)$qz['pass_mark'] ?>%</small></td>
          <td class="num"><?= $s['learners'] ?></td>
          <td class="w-progress"><?= progress_bar($s['pass_rate']) ?><small class="muted"><?= $s['pass_rate'] ?>% (<?= $s['passed'] ?>)</small></td>
          <td class="num"><?= $s['avg'] !== null ? $s['avg'] . '%' : '—' ?></td>
          <td class="num"><?= $s['attempts'] ?></td>
          <td class="right"><a href="<?= e(url('/reports/quizzes/' . $qz['id'], $q)) ?>">Question analysis</a></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</section>
<?php endif; ?>

<section class="section">
  <h2>Learners</h2>
  <div class="card table-wrap">
    <table class="table">
      <thead><tr><th>Learner</th><th>Team</th><th>Progress</th><th class="num">Lessons</th><th class="num">Quizzes passed</th><th class="num">Score</th><th>Status</th><th>Due</th></tr></thead>
      <tbody>
      <?php foreach ($enrolments as $e): $pct = $e['completed_at'] ? 100 : (int)$e['p']['pct']; ?>
        <tr>
          <td><a href="<?= e(url('/reports/users/' . $e['user_id'])) ?>"><?= e($e['name']) ?></a><?php if ($e['employee_id']): ?><br><small class="muted"><?= e($e['employee_id']) ?></small><?php endif; ?></td>
          <td class="small"><?= e($e['team_name'] ?: '—') ?></td>
          <td class="w-progress"><?= progress_bar($pct) ?><small class="muted"><?= $pct ?>%</small></td>
          <td class="num"><?= (int)$e['p']['lessons_done'] ?>/<?= (int)$totals['lessons'] ?></td>
          <td class="num"><?= (int)$e['p']['quizzes_passed'] ?>/<?= (int)$totals['quizzes'] ?></td>
          <td class="num"><?= $e['p']['avg_score'] !== null ? (int)$e['p']['avg_score'] . '%' : '—' ?></td>
          <td><?= enrolment_badge($e['completed_at'], $e['due_date'], $pct) ?></td>
          <td class="small <?= $e['overdue'] ? 'text-danger' : '' ?>"><?= e(fmt_date($e['due_date'])) ?></td>
        </tr>
      <?php endforeach; ?>
      <?php if (!$enrolments): ?><tr><td colspan="8" class="muted center pad">No learners enrolled in this view.</td></tr><?php endif; ?>
      </tbody>
    </table>
  </div>
</section>
