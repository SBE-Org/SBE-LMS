<?php
$first = explode(' ', $user['name'])[0];
$hour = (int)date('G');
$greet = $hour < 12 ? 'Good morning' : ($hour < 17 ? 'Good afternoon' : 'Good evening');
$overdueCount = count(array_filter($active, fn($e) => $e['overdue']));
?>
<div class="page-head">
  <div>
    <h1><?= e($greet) ?>, <?= e($first) ?></h1>
    <p class="muted"><?= $active ? plural(count($active), 'course') . ' in progress' : 'You have no courses in progress' ?><?= $overdueCount ? ' · <span class="text-danger">' . plural($overdueCount, 'overdue course') . '</span>' : '' ?></p>
  </div>
  <a class="btn btn-ghost" href="<?= e(url('/courses')) ?>"><?= icon('book') ?>Browse courses</a>
</div>

<?php if ($snapshot !== null): ?>
<section class="section">
  <div class="section-head"><h2><?= has_role('team_lead') ? 'Your teams at a glance' : 'Training at a glance' ?></h2><a href="<?= e(url('/reports')) ?>">Full reports <?= icon('arrow-right') ?></a></div>
  <div class="stats">
    <div class="stat"><span class="stat-label">Active learners</span><span class="stat-value"><?= (int)$snapshot['learners'] ?></span></div>
    <div class="stat"><span class="stat-label">Completion rate</span><span class="stat-value"><?= (int)$snapshot['completion_rate'] ?>%</span><span class="stat-sub"><?= (int)$snapshot['completed'] ?> of <?= (int)$snapshot['enrolments'] ?> enrolments</span></div>
    <div class="stat"><span class="stat-label">Average quiz score</span><span class="stat-value"><?= $snapshot['avg_score'] !== null ? (int)$snapshot['avg_score'] . '%' : '—' ?></span></div>
    <div class="stat <?= $snapshot['overdue'] ? 'stat-alert' : '' ?>"><span class="stat-label">Overdue</span><span class="stat-value"><?= (int)$snapshot['overdue'] ?></span><span class="stat-sub">enrolments past due date</span></div>
  </div>
</section>
<?php endif; ?>

<?php if ($resume): ?>
<section class="resume card">
  <div>
    <p class="eyebrow">Continue where you left off</p>
    <h2><?= e($resume['course']['title']) ?></h2>
    <p class="muted">Next: <?= $resume['next']['type'] === 'quiz' ? icon('quiz', 'icon icon-inline') : icon('text', 'icon icon-inline') ?> <?= e($resume['next']['title']) ?></p>
    <?= progress_bar($resume['course']['progress']['pct']) ?>
  </div>
  <a class="btn btn-primary" href="<?= e(url(($resume['next']['type'] === 'quiz' ? '/quizzes/' : '/lessons/') . $resume['next']['id'])) ?>"><?= $resume['course']['progress']['pct'] > 0 ? 'Continue' : 'Start' ?> <?= icon('arrow-right') ?></a>
</section>
<?php endif; ?>

<section class="section">
  <div class="section-head"><h2>My learning</h2></div>
  <?php if (!$active && !$completed): ?>
    <div class="empty-state card">
      <?= icon('book', 'icon icon-xl') ?>
      <h3>No courses yet</h3>
      <p class="muted">When your trainer or team lead assigns you a course it will appear here. You can also join open courses yourself.</p>
      <a class="btn btn-primary" href="<?= e(url('/courses')) ?>">Browse courses</a>
    </div>
  <?php elseif (!$active): ?>
    <div class="empty-state card"><?= icon('check', 'icon icon-xl text-success') ?><h3>All caught up</h3><p class="muted">You have completed every course assigned to you.</p></div>
  <?php else: ?>
    <div class="course-grid">
      <?php foreach ($active as $e): ?>
        <a class="course-card card" href="<?= e(url('/courses/' . $e['course_id'])) ?>">
          <div class="course-card-top">
            <span class="chip"><?= e($e['category'] ?: 'General') ?></span>
            <?= enrolment_badge($e['completed_at'], $e['due_date'], $e['progress']['pct']) ?>
          </div>
          <h3><?= e($e['title']) ?></h3>
          <p class="muted clamp"><?= e($e['summary']) ?></p>
          <div class="course-card-foot">
            <?= progress_bar($e['progress']['pct']) ?>
            <div class="row-between small muted">
              <span><?= (int)$e['progress']['pct'] ?>% · <?= (int)$e['progress']['done'] ?>/<?= (int)$e['progress']['total'] ?> items</span>
              <?php if ($e['due_date']): ?><span class="<?= $e['overdue'] ? 'text-danger' : '' ?>">Due <?= e(fmt_date($e['due_date'])) ?></span><?php endif; ?>
            </div>
          </div>
        </a>
      <?php endforeach; ?>
    </div>
  <?php endif; ?>
</section>

<?php if ($completed || $certificates): ?>
<section class="section two-col">
  <div>
    <div class="section-head"><h2>Completed</h2></div>
    <div class="card list">
      <?php if (!$completed): ?><p class="muted pad">Nothing completed yet.</p><?php endif; ?>
      <?php foreach ($completed as $e): ?>
        <a class="list-row" href="<?= e(url('/courses/' . $e['course_id'])) ?>">
          <span class="list-icon done"><?= icon('check') ?></span>
          <span class="list-main"><strong><?= e($e['title']) ?></strong><small class="muted">Completed <?= e(fmt_date($e['completed_at'])) ?></small></span>
        </a>
      <?php endforeach; ?>
    </div>
  </div>
  <div>
    <div class="section-head"><h2>Certificates</h2><a href="<?= e(url('/certificates')) ?>">All <?= icon('arrow-right') ?></a></div>
    <div class="card list">
      <?php if (!$certificates): ?><p class="muted pad">Finish a course to earn your first certificate.</p><?php endif; ?>
      <?php foreach ($certificates as $c): ?>
        <a class="list-row" href="<?= e(url('/certificates/' . $c['code'])) ?>">
          <span class="list-icon award"><?= icon('award') ?></span>
          <span class="list-main"><strong><?= e($c['title']) ?></strong><small class="muted"><?= e(fmt_date($c['issued_at'])) ?> · <?= e($c['code']) ?></small></span>
        </a>
      <?php endforeach; ?>
    </div>
  </div>
</section>
<?php endif; ?>
