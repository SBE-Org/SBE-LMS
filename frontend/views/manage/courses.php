<div class="page-head">
  <div><h1>Manage courses</h1><p class="muted">Build courses, add lessons and quizzes, and assign them to people and teams.</p></div>
  <a class="btn btn-primary" href="<?= e(url('/manage/courses/new')) ?>"><?= icon('plus') ?>New course</a>
</div>

<nav class="tabs" aria-label="Filter by status">
  <?php foreach (['' => 'All', 'published' => 'Published', 'draft' => 'Drafts', 'archived' => 'Archived'] as $k => $label): ?>
    <a href="<?= e(url('/manage/courses', $k ? ['status' => $k] : [])) ?>"<?= $status === $k ? ' aria-current="page"' : '' ?>><?= e($label) ?></a>
  <?php endforeach; ?>
</nav>

<?php if (!$courses): ?>
  <div class="empty-state card"><?= icon('book', 'icon icon-xl') ?><h3>No courses here</h3><p class="muted">Create your first course to get started.</p><a class="btn btn-primary" href="<?= e(url('/manage/courses/new')) ?>">New course</a></div>
<?php else: ?>
<div class="card table-wrap">
  <table class="table">
    <thead><tr><th>Course</th><th>Status</th><th>Content</th><th>Learners</th><th>Updated</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($courses as $c): ?>
      <tr>
        <td><a href="<?= e(url('/manage/courses/' . $c['id'])) ?>"><strong><?= e($c['title']) ?></strong></a><br><small class="muted"><?= e($c['category'] ?: 'General') ?></small></td>
        <td><?= badge(ucfirst($c['status']), ['published' => 'success', 'draft' => 'warning', 'archived' => 'neutral'][$c['status']] ?? 'neutral') ?></td>
        <td class="small"><?= plural((int)$c['lesson_count'], 'lesson') ?>, <?= plural((int)$c['quiz_count'], 'quiz', 'quizzes') ?></td>
        <td class="small"><?= (int)$c['enrolled'] ?> enrolled<br><span class="muted"><?= (int)$c['completed'] ?> completed</span></td>
        <td class="small muted"><?= e(fmt_date($c['updated_at'])) ?></td>
        <td class="right nowrap">
          <a class="btn btn-ghost btn-sm" href="<?= e(url('/manage/courses/' . $c['id'] . '/enrolments')) ?>"><?= icon('users') ?>Enrol</a>
          <a class="btn btn-ghost btn-sm" href="<?= e(url('/manage/courses/' . $c['id'])) ?>"><?= icon('edit') ?>Build</a>
        </td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table>
</div>
<?php endif; ?>
