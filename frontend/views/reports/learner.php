<nav class="crumbs"><a href="<?= e(url('/reports')) ?>">Reports</a><span>/</span><span><?= e($person['name']) ?></span></nav>
<div class="page-head">
  <div class="person person-lg">
    <span class="avatar avatar-lg"><?= e(initials($person['name'])) ?></span>
    <div>
      <h1><?= e($person['name']) ?></h1>
      <p class="muted"><?= e(ROLES[$person['role']] ?? $person['role']) ?> · <?= e($person['team_name'] ?: 'No team') ?><?= $person['employee_id'] ? ' · ' . e($person['employee_id']) : '' ?> · last sign-in <?= $person['last_login_at'] ? e(fmt_datetime($person['last_login_at'])) : 'never' ?></p>
    </div>
  </div>
  <?php if (has_role('admin')): ?><a class="btn btn-ghost" href="<?= e(url('/admin/users/' . $person['id'] . '/edit')) ?>"><?= icon('edit') ?>Edit person</a><?php endif; ?>
</div>

<section class="section">
  <h2>Courses</h2>
  <div class="card table-wrap">
    <table class="table">
      <thead><tr><th>Course</th><th>Progress</th><th class="num">Avg score</th><th>Status</th><th>Enrolled</th><th>Due</th><th>Completed</th></tr></thead>
      <tbody>
      <?php foreach ($enrolments as $e): $pct = $e['completed_at'] ? 100 : (int)$e['p']['pct']; ?>
        <tr>
          <td><a href="<?= e(url('/reports/courses/' . $e['course_id'])) ?>"><?= e($e['title']) ?></a></td>
          <td class="w-progress"><?= progress_bar($pct) ?><small class="muted"><?= $pct ?>%</small></td>
          <td class="num"><?= $e['p']['avg_score'] !== null ? (int)$e['p']['avg_score'] . '%' : '—' ?></td>
          <td><?= enrolment_badge($e['completed_at'], $e['due_date'], $pct) ?></td>
          <td class="small"><?= e(fmt_date($e['enrolled_at'])) ?></td>
          <td class="small <?= $e['overdue'] ? 'text-danger' : '' ?>"><?= e(fmt_date($e['due_date'])) ?></td>
          <td class="small"><?= e(fmt_date($e['completed_at'])) ?></td>
        </tr>
      <?php endforeach; ?>
      <?php if (!$enrolments): ?><tr><td colspan="7" class="muted center pad">Not enrolled in any course.</td></tr><?php endif; ?>
      </tbody>
    </table>
  </div>
</section>

<section class="section two-col">
  <div>
    <h2>Quiz attempts</h2>
    <div class="card list">
      <?php foreach ($attempts as $a): ?>
        <a class="list-row" href="<?= e(url('/attempts/' . $a['id'] . '/result')) ?>">
          <span class="list-icon <?= (int)$a['passed'] === 1 ? 'done' : 'fail' ?>"><?= icon((int)$a['passed'] === 1 ? 'check' : 'x') ?></span>
          <span class="list-main"><strong><?= e($a['quiz_title']) ?> — <?= (int)$a['percent'] ?>%</strong><small class="muted"><?= e($a['course_title']) ?> · <?= e(fmt_datetime($a['submitted_at'])) ?></small></span>
        </a>
      <?php endforeach; ?>
      <?php if (!$attempts): ?><p class="muted pad">No quiz attempts yet.</p><?php endif; ?>
    </div>
  </div>
  <div>
    <h2>Certificates</h2>
    <div class="card list">
      <?php foreach ($certificates as $c): ?>
        <a class="list-row" href="<?= e(url('/certificates/' . $c['code'])) ?>"><span class="list-icon award"><?= icon('award') ?></span><span class="list-main"><strong><?= e($c['title']) ?></strong><small class="muted"><?= e(fmt_date($c['issued_at'])) ?> · <?= e($c['code']) ?></small></span></a>
      <?php endforeach; ?>
      <?php if (!$certificates): ?><p class="muted pad">No certificates yet.</p><?php endif; ?>
    </div>
  </div>
</section>
