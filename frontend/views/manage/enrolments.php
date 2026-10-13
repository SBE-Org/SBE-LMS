<nav class="crumbs"><a href="<?= e(url('/manage/courses')) ?>">Manage courses</a><span>/</span><a href="<?= e(url('/manage/courses/' . $course['id'])) ?>"><?= e($course['title']) ?></a><span>/</span><span>Enrolments</span></nav>
<div class="page-head">
  <div><h1>Enrolments</h1><p class="muted"><?= e($course['title']) ?> · <?= plural(count($enrolled), 'learner') ?> enrolled</p></div>
  <a class="btn btn-ghost" href="<?= e(url('/reports/courses/' . $course['id'])) ?>"><?= icon('chart') ?>Course report</a>
</div>

<form method="post" action="<?= e(url('/manage/courses/' . $course['id'] . '/enrolments')) ?>" class="card form">
  <?= csrf_field() ?>
  <h2>Assign this course</h2>
  <div class="grid-2">
    <div class="field">
      <span class="label">Teams</span>
      <div class="check-list">
        <?php foreach ($teams as $t): ?>
          <label class="check"><input type="checkbox" name="team_ids[]" value="<?= (int)$t['id'] ?>"> <span><?= e($t['name']) ?> <small class="muted">(<?= (int)$t['members'] ?> people)</small></span></label>
        <?php endforeach; ?>
        <?php if (!$teams): ?><p class="muted small">No teams yet. <a href="<?= e(url('/admin/teams/new')) ?>">Create one</a>.</p><?php endif; ?>
      </div>
      <label class="check small"><input type="checkbox" name="auto_enrol_new" value="1" checked> <span>Also enrol people who join these teams later</span></label>
    </div>
    <div class="field">
      <label for="user_ids" class="label">Individual people <small class="muted">(hold Ctrl / ⌘ to pick several)</small></label>
      <input type="search" class="filter-input" placeholder="Filter by name or team" data-filter-select="user_ids" aria-label="Filter people">
      <select id="user_ids" name="user_ids[]" multiple size="9">
        <?php $group = null; foreach ($users as $u):
            $g = $u['team_name'] ?: 'No team';
            if ($g !== $group): if ($group !== null) echo '</optgroup>'; $group = $g; ?><optgroup label="<?= e($g) ?>"><?php endif; ?>
          <option value="<?= (int)$u['id'] ?>"><?= e($u['name']) ?> — <?= e(ROLES[$u['role']] ?? $u['role']) ?></option>
        <?php endforeach; if ($group !== null) echo '</optgroup>'; ?>
      </select>
    </div>
  </div>
  <div class="actions">
    <label class="field inline-field"><span>Due date <small class="muted">(optional)</small></span><input type="date" name="due_date" min="<?= e(today()) ?>"></label>
    <button class="btn btn-primary" type="submit"><?= icon('users') ?>Enrol</button>
  </div>
</form>

<?php if ($teamAssignments): ?>
<section class="section">
  <h2>Automatic team enrolment</h2>
  <div class="card list">
    <?php foreach ($teamAssignments as $ta): ?>
      <div class="list-row">
        <span class="list-icon"><?= icon('team') ?></span>
        <span class="list-main"><strong><?= e($ta['name']) ?></strong><small class="muted"><?= (int)$ta['members'] ?> people<?= $ta['due_days'] ? ' · due ' . (int)$ta['due_days'] . ' days after joining' : '' ?></small></span>
        <?= post_button('/manage/team-courses/' . $ta['id'] . '/delete', 'Stop', 'btn btn-ghost btn-sm', 'Stop enrolling new members of ' . $ta['name'] . ' automatically?') ?>
      </div>
    <?php endforeach; ?>
  </div>
</section>
<?php endif; ?>

<section class="section">
  <h2>Enrolled learners</h2>
  <?php if (!$enrolled): ?>
    <div class="empty-state card"><p class="muted">Nobody is enrolled yet.</p></div>
  <?php else: ?>
  <div class="card table-wrap">
    <table class="table">
      <thead><tr><th>Learner</th><th>Team</th><th>Progress</th><th>Status</th><th>Due</th><th></th></tr></thead>
      <tbody>
      <?php foreach ($enrolled as $e): ?>
        <tr>
          <td><a href="<?= e(url('/reports/users/' . $e['user_id'])) ?>"><?= e($e['name']) ?></a><br><small class="muted"><?= e($e['email']) ?></small></td>
          <td class="small"><?= e($e['team_name'] ?: '—') ?></td>
          <td class="w-progress"><?= progress_bar($e['completed_at'] ? 100 : (int)$e['pct']) ?><small class="muted"><?= $e['completed_at'] ? 100 : (int)$e['pct'] ?>%</small></td>
          <td><?= enrolment_badge($e['completed_at'], $e['due_date'], (int)$e['pct']) ?></td>
          <td class="small"><?= e(fmt_date($e['due_date'])) ?></td>
          <td class="right"><?= post_button('/manage/enrolments/' . $e['id'] . '/delete', icon('x'), 'icon-btn danger', 'Remove ' . $e['name'] . ' from this course?', [], 'Remove') ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?php endif; ?>
</section>
