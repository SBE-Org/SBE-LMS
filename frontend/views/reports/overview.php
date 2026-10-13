<?php $q = $team ? ['team' => $team] : []; ?>
<div class="page-head">
  <div><h1>Reports</h1><p class="muted"><?= has_role('team_lead') ? 'Training progress for the teams you lead.' : 'Training progress across Shaggar BPO.' ?></p></div>
  <div class="actions">
    <a class="btn btn-ghost" href="<?= e(url('/reports/export', $q + ['type' => 'enrolments'])) ?>"><?= icon('download') ?>Progress CSV</a>
    <a class="btn btn-ghost" href="<?= e(url('/reports/export', $q + ['type' => 'attempts'])) ?>"><?= icon('download') ?>Quiz results CSV</a>
  </div>
</div>

<?php if ($teamOptions): ?>
<form class="toolbar" method="get" action="<?= e(url('/reports')) ?>">
  <select name="team" aria-label="Team" data-autosubmit>
    <option value=""><?= has_role('team_lead') ? 'All my teams' : 'All teams' ?></option>
    <?php foreach ($teamOptions as $t): ?><option value="<?= (int)$t['id'] ?>" <?= $team === (int)$t['id'] ? 'selected' : '' ?>><?= e($t['name']) ?></option><?php endforeach; ?>
  </select>
  <noscript><button class="btn btn-ghost" type="submit">Apply</button></noscript>
</form>
<?php elseif (has_role('team_lead')): ?>
  <div class="flash flash-info">You are not set as the lead of any team yet. Ask an administrator to set you as team lead on the team page.</div>
<?php endif; ?>

<div class="stats">
  <div class="stat"><span class="stat-label">Active learners</span><span class="stat-value"><?= (int)$summary['learners'] ?></span><span class="stat-sub"><?= (int)$summary['enrolments'] ?> enrolments</span></div>
  <div class="stat"><span class="stat-label">Completion rate</span><span class="stat-value"><?= (int)$summary['completion_rate'] ?>%</span><span class="stat-sub"><?= (int)$summary['completed'] ?> completed</span></div>
  <div class="stat"><span class="stat-label">Average quiz score</span><span class="stat-value"><?= $summary['avg_score'] !== null ? (int)$summary['avg_score'] . '%' : '—' ?></span><span class="stat-sub">best attempt per quiz</span></div>
  <div class="stat <?= $summary['overdue'] ? 'stat-alert' : '' ?>"><span class="stat-label">Overdue</span><span class="stat-value"><?= (int)$summary['overdue'] ?></span><span class="stat-sub"><?= (int)$summary['certificates'] ?> certificates issued</span></div>
</div>

<section class="section">
  <h2>By course</h2>
  <div class="card table-wrap">
    <table class="table">
      <thead><tr><th>Course</th><th class="num">Enrolled</th><th>Completion</th><th class="num">In progress</th><th class="num">Not started</th><th class="num">Overdue</th><th class="num">Avg score</th></tr></thead>
      <tbody>
      <?php foreach ($courses as $c): ?>
        <tr>
          <td><a href="<?= e(url('/reports/courses/' . $c['id'], $q)) ?>"><strong><?= e($c['title']) ?></strong></a><?= $c['status'] !== 'published' ? ' ' . badge(ucfirst($c['status']), 'neutral') : '' ?></td>
          <td class="num"><?= $c['enrolled'] ?></td>
          <td class="w-progress"><?= progress_bar($c['rate']) ?><small class="muted"><?= $c['rate'] ?>% · <?= $c['completed'] ?> done</small></td>
          <td class="num"><?= $c['in_progress'] ?></td>
          <td class="num"><?= $c['not_started'] ?></td>
          <td class="num <?= $c['overdue'] ? 'text-danger' : '' ?>"><?= $c['overdue'] ?></td>
          <td class="num"><?= $c['avg_score'] !== null ? $c['avg_score'] . '%' : '—' ?></td>
        </tr>
      <?php endforeach; ?>
      <?php if (!$courses): ?><tr><td colspan="7" class="muted center pad">No enrolments yet.</td></tr><?php endif; ?>
      </tbody>
    </table>
  </div>
</section>

<?php if (count($teams) > 1 || !$team): ?>
<section class="section">
  <h2>By team</h2>
  <div class="card table-wrap">
    <table class="table">
      <thead><tr><th>Team</th><th class="num">People</th><th class="num">Enrolments</th><th>Completion</th><th class="num">Overdue</th><th class="num">Avg score</th></tr></thead>
      <tbody>
      <?php foreach ($teams as $t): ?>
        <tr>
          <td><?php if ($t['id']): ?><a href="<?= e(url('/reports', ['team' => $t['id']])) ?>"><strong><?= e($t['name']) ?></strong></a><?php else: ?><span class="muted"><?= e($t['name']) ?></span><?php endif; ?></td>
          <td class="num"><?= $t['people'] ?></td>
          <td class="num"><?= $t['enrolled'] ?></td>
          <td class="w-progress"><?= progress_bar($t['rate']) ?><small class="muted"><?= $t['rate'] ?>%</small></td>
          <td class="num <?= $t['overdue'] ? 'text-danger' : '' ?>"><?= $t['overdue'] ?></td>
          <td class="num"><?= $t['avg_score'] !== null ? $t['avg_score'] . '%' : '—' ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</section>
<?php endif; ?>

<section class="section">
  <div class="section-head"><h2>Learners</h2><span class="small muted">Overdue first, then least progress</span></div>
  <div class="card table-wrap">
    <table class="table" data-sortable>
      <thead><tr><th>Name</th><th>Team</th><th class="num">Courses</th><th>Average progress</th><th class="num">Overdue</th><th class="num">Avg score</th><th>Last sign-in</th></tr></thead>
      <tbody>
      <?php foreach ($learners as $l): ?>
        <tr>
          <td><a href="<?= e(url('/reports/users/' . $l['id'])) ?>"><?= e($l['name']) ?></a></td>
          <td class="small"><?= e($l['team'] ?: '—') ?></td>
          <td class="num"><?= $l['completed'] ?>/<?= $l['enrolled'] ?></td>
          <td class="w-progress"><?= progress_bar($l['progress']) ?><small class="muted"><?= $l['progress'] ?>%</small></td>
          <td class="num <?= $l['overdue'] ? 'text-danger' : '' ?>"><?= $l['overdue'] ?></td>
          <td class="num"><?= $l['avg_score'] !== null ? $l['avg_score'] . '%' : '—' ?></td>
          <td class="small muted"><?= $l['last_login_at'] ? e(fmt_date($l['last_login_at'])) : 'Never' ?></td>
        </tr>
      <?php endforeach; ?>
      <?php if (!$learners): ?><tr><td colspan="7" class="muted center pad">No learners in this view.</td></tr><?php endif; ?>
      </tbody>
    </table>
  </div>
</section>
