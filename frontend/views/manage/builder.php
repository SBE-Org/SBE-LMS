<nav class="crumbs"><a href="<?= e(url('/manage/courses')) ?>">Manage courses</a><span>/</span><span><?= e($course['title']) ?></span></nav>

<div class="page-head">
  <div>
    <h1><?= e($course['title']) ?></h1>
    <p class="muted"><?= badge(ucfirst($course['status']), ['published' => 'success', 'draft' => 'warning'][$course['status']] ?? 'neutral') ?> · <?= e($course['category'] ?: 'General') ?> · <?= plural($enrolled, 'learner') ?> enrolled</p>
  </div>
  <div class="actions">
    <a class="btn btn-ghost" href="<?= e(url('/courses/' . $course['id'])) ?>"><?= icon('eye') ?>Preview</a>
    <a class="btn btn-ghost" href="<?= e(url('/manage/courses/' . $course['id'] . '/edit')) ?>"><?= icon('edit') ?>Settings</a>
    <a class="btn btn-ghost" href="<?= e(url('/reports/courses/' . $course['id'])) ?>"><?= icon('chart') ?>Report</a>
    <a class="btn btn-primary" href="<?= e(url('/manage/courses/' . $course['id'] . '/enrolments')) ?>"><?= icon('users') ?>Enrol learners</a>
  </div>
</div>

<?php if ($course['status'] === 'draft'): ?>
  <div class="flash flash-info">This course is a draft. Learners will see it once you set its status to Published in <a href="<?= e(url('/manage/courses/' . $course['id'] . '/edit')) ?>">Settings</a>.</div>
<?php endif; ?>

<section class="section">
  <div class="section-head"><h2>Modules and lessons</h2></div>
  <?php foreach ($modules as $i => $m): ?>
    <div class="module card builder-module">
      <div class="module-head">
        <span class="module-num"><?= $i + 1 ?></span>
        <form method="post" action="<?= e(url('/manage/modules/' . $m['id'] . '/edit')) ?>" class="rename-form">
          <?= csrf_field() ?>
          <input name="title" value="<?= e($m['title']) ?>" aria-label="Module title" maxlength="200" required>
          <button class="btn btn-ghost btn-sm" type="submit">Rename</button>
        </form>
        <div class="row-actions">
          <?= post_button('/manage/modules/' . $m['id'] . '/move', icon('up'), 'icon-btn', null, ['dir' => 'up'], 'Move up') ?>
          <?= post_button('/manage/modules/' . $m['id'] . '/move', icon('down'), 'icon-btn', null, ['dir' => 'down'], 'Move down') ?>
          <?= post_button('/manage/modules/' . $m['id'] . '/delete', icon('trash'), 'icon-btn danger', 'Delete the module “' . $m['title'] . '” and all ' . count($m['lessons']) . ' lessons in it?', [], 'Delete') ?>
        </div>
      </div>
      <ol class="builder-list">
        <?php foreach ($m['lessons'] as $l): ?>
          <li>
            <span class="status-dot"><?= lesson_icon($l['type']) ?></span>
            <a href="<?= e(url('/manage/lessons/' . $l['id'] . '/edit')) ?>" class="builder-title"><?= e($l['title']) ?></a>
            <span class="small muted"><?= e(ucfirst($l['type'])) ?><?= $l['duration_min'] ? ' · ' . (int)$l['duration_min'] . ' min' : '' ?><?= $l['file_name'] ? ' · ' . e($l['file_name']) : '' ?></span>
            <span class="row-actions">
              <?= post_button('/manage/lessons/' . $l['id'] . '/move', icon('up'), 'icon-btn', null, ['dir' => 'up'], 'Move up') ?>
              <?= post_button('/manage/lessons/' . $l['id'] . '/move', icon('down'), 'icon-btn', null, ['dir' => 'down'], 'Move down') ?>
              <a class="icon-btn" href="<?= e(url('/manage/lessons/' . $l['id'] . '/edit')) ?>" aria-label="Edit lesson"><?= icon('edit') ?></a>
              <?= post_button('/manage/lessons/' . $l['id'] . '/delete', icon('trash'), 'icon-btn danger', 'Delete the lesson “' . $l['title'] . '”?', [], 'Delete') ?>
            </span>
          </li>
        <?php endforeach; ?>
        <?php if (!$m['lessons']): ?><li class="muted small">No lessons yet.</li><?php endif; ?>
      </ol>
      <a class="btn btn-ghost btn-sm add-btn" href="<?= e(url('/manage/modules/' . $m['id'] . '/lessons/new')) ?>"><?= icon('plus') ?>Add lesson</a>
    </div>
  <?php endforeach; ?>

  <form method="post" action="<?= e(url('/manage/courses/' . $course['id'] . '/modules')) ?>" class="card inline-add">
    <?= csrf_field() ?>
    <input name="title" placeholder="New module title, e.g. “Module 2: Handling complaints”" aria-label="New module title" maxlength="200" required>
    <button class="btn btn-ghost" type="submit"><?= icon('plus') ?>Add module</button>
  </form>
</section>

<section class="section">
  <div class="section-head"><h2>Quizzes</h2><a class="btn btn-ghost btn-sm" href="<?= e(url('/manage/courses/' . $course['id'] . '/quizzes/new')) ?>"><?= icon('plus') ?>Add quiz</a></div>
  <?php if (!$quizzes): ?>
    <div class="empty-state card"><p class="muted">No quizzes yet. Learners complete the course by finishing every lesson (and passing every quiz, if there are any).</p></div>
  <?php else: ?>
  <div class="card table-wrap">
    <table class="table">
      <thead><tr><th>Quiz</th><th>Questions</th><th>Pass mark</th><th>Time</th><th>Attempts</th><th></th></tr></thead>
      <tbody>
      <?php foreach ($quizzes as $q): ?>
        <tr>
          <td><a href="<?= e(url('/manage/quizzes/' . $q['id'])) ?>"><strong><?= e($q['title']) ?></strong></a></td>
          <td><?= (int)$q['question_count'] ?> <span class="muted small">(<?= (int)$q['total_points'] ?> pts)</span><?= (int)$q['question_count'] === 0 ? ' ' . badge('Needs questions', 'warning') : '' ?></td>
          <td><?= (int)$q['pass_mark'] ?>%</td>
          <td><?= $q['time_limit_min'] ? (int)$q['time_limit_min'] . ' min' : '—' ?></td>
          <td><?= (int)$q['max_attempts'] ?: 'Unlimited' ?></td>
          <td class="right"><a class="btn btn-ghost btn-sm" href="<?= e(url('/manage/quizzes/' . $q['id'])) ?>"><?= icon('edit') ?>Questions</a></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?php endif; ?>
</section>
