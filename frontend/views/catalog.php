<div class="page-head">
  <div><h1>Courses</h1><p class="muted">Your assigned courses and courses open to everyone.</p></div>
</div>

<form class="toolbar" method="get" action="<?= e(url('/courses')) ?>">
  <label class="search"><?= icon('search') ?><input type="search" name="q" value="<?= e($q) ?>" placeholder="Search courses" aria-label="Search courses"></label>
  <select name="category" aria-label="Category" data-autosubmit>
    <option value="">All categories</option>
    <?php foreach ($categories as $c): ?><option value="<?= e($c) ?>" <?= $c === $category ? 'selected' : '' ?>><?= e($c) ?></option><?php endforeach; ?>
  </select>
  <button class="btn btn-ghost" type="submit">Search</button>
</form>

<?php if (!$courses): ?>
  <div class="empty-state card"><?= icon('book', 'icon icon-xl') ?><h3>No courses found</h3><p class="muted"><?= $q || $category ? 'Try a different search.' : 'No courses have been assigned to you yet.' ?></p></div>
<?php else: ?>
<div class="course-grid">
  <?php foreach ($courses as $c): ?>
    <div class="course-card card">
      <div class="course-card-top">
        <span class="chip"><?= e($c['category'] ?: 'General') ?></span>
        <?php if ($c['enrolment_id']): ?>
          <?= enrolment_badge($c['completed_at'], $c['due_date'], (int)$c['pct']) ?>
        <?php else: ?>
          <?= badge('Open to join', 'accent') ?>
        <?php endif; ?>
      </div>
      <h3><a class="stretched" href="<?= e(url('/courses/' . $c['id'])) ?>"><?= e($c['title']) ?></a></h3>
      <p class="muted clamp"><?= e($c['summary']) ?></p>
      <div class="course-card-foot">
        <?php if ($c['enrolment_id']): ?>
          <?= progress_bar((int)$c['pct']) ?>
          <span class="small muted"><?= (int)$c['pct'] ?>% complete</span>
        <?php else: ?>
          <span class="small muted"><?= plural((int)$c['items'], 'lesson or quiz', 'lessons and quizzes') ?></span>
        <?php endif; ?>
      </div>
    </div>
  <?php endforeach; ?>
</div>
<?php endif; ?>
