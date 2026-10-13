<?php
$enrolled = (bool)$enrolment;
$next = $outline['next'];
$lessonCount = count($outline['lessons']);
$minutes = array_sum(array_map(fn($l) => (int)$l['duration_min'], $outline['lessons']));
?>
<nav class="crumbs"><a href="<?= e(url('/courses')) ?>">Courses</a><span>/</span><span><?= e($course['title']) ?></span></nav>

<?php if (!$enrolled && is_staff()): ?>
  <div class="flash flash-info">Preview mode: you are not enrolled, so progress is not recorded. <?= $course['status'] !== 'published' ? 'This course is a <strong>' . e($course['status']) . '</strong> and hidden from learners.' : '' ?> <a href="<?= e(url('/manage/courses/' . $course['id'])) ?>">Edit course</a></div>
<?php endif; ?>

<section class="course-hero card">
  <div class="course-hero-main">
    <span class="chip"><?= e($course['category'] ?: 'General') ?></span>
    <h1><?= e($course['title']) ?></h1>
    <p class="lead"><?= nl2br(e($course['summary'])) ?></p>
    <p class="meta muted small">
      <?= icon('book', 'icon icon-inline') ?> <?= plural($lessonCount, 'lesson') ?>
      · <?= icon('quiz', 'icon icon-inline') ?> <?= plural(count($outline['quizzes']), 'quiz', 'quizzes') ?>
      <?php if ($minutes): ?>· <?= icon('clock', 'icon icon-inline') ?> about <?= $minutes ?> min<?php endif; ?>
      <?php if ($enrolment && $enrolment['due_date']): ?>· Due <?= e(fmt_date($enrolment['due_date'])) ?><?php endif; ?>
    </p>
  </div>
  <div class="course-hero-side">
    <?php if ($certificate): ?>
      <div class="cert-banner"><?= icon('award', 'icon icon-lg') ?><div><strong>Course completed</strong><small>Certificate earned <?= e(fmt_date($certificate['issued_at'])) ?></small></div></div>
      <a class="btn btn-primary btn-block" href="<?= e(url('/certificates/' . $certificate['code'])) ?>"><?= icon('award') ?>View certificate</a>
    <?php elseif ($enrolled): ?>
      <div class="big-pct"><?= (int)$progress['pct'] ?><span>%</span></div>
      <?= progress_bar((int)$progress['pct']) ?>
      <p class="small muted"><?= (int)$progress['done'] ?> of <?= (int)$progress['total'] ?> items complete</p>
      <?php if ($enrolment['completed_at']): ?>
        <?= badge('Completed', 'success') ?>
      <?php elseif ($next): ?>
        <a class="btn btn-primary btn-block" href="<?= e(url(($next['type'] === 'quiz' ? '/quizzes/' : '/lessons/') . $next['id'])) ?>"><?= $progress['pct'] > 0 ? 'Continue' : 'Start course' ?> <?= icon('arrow-right') ?></a>
      <?php endif; ?>
    <?php elseif ((int)$course['self_enrol'] === 1): ?>
      <p class="muted small">This course is open to everyone.</p>
      <?= post_button('/courses/' . $course['id'] . '/enrol', 'Join this course', 'btn btn-primary btn-block') ?>
    <?php endif; ?>
  </div>
</section>

<section class="section">
  <h2>Course content</h2>
  <?php if (!$outline['modules'] && !$outline['quizzes']): ?>
    <div class="empty-state card"><p class="muted">This course has no content yet.</p></div>
  <?php endif; ?>
  <?php foreach ($outline['modules'] as $i => $m): ?>
    <?php if (!$m['lessons'] && !is_staff()) continue; ?>
    <?php $mDone = count(array_filter($m['lessons'], fn($l) => $l['completed_at'])); ?>
    <div class="module card">
      <div class="module-head">
        <span class="module-num"><?= $i + 1 ?></span>
        <h3><?= e($m['title']) ?></h3>
        <?php if ($enrolled && $m['lessons']): ?><span class="small muted"><?= $mDone ?>/<?= count($m['lessons']) ?></span><?php endif; ?>
      </div>
      <ol class="outline">
        <?php foreach ($m['lessons'] as $l): ?>
          <li class="<?= $l['completed_at'] ? 'is-done' : '' ?> <?= $next && $next['type'] === 'lesson' && $next['id'] === (int)$l['id'] ? 'is-next' : '' ?>">
            <a href="<?= e(url('/lessons/' . $l['id'])) ?>">
              <span class="status-dot"><?= $l['completed_at'] ? icon('check') : lesson_icon($l['type']) ?></span>
              <span class="outline-title"><?= e($l['title']) ?></span>
              <?php if ($l['duration_min']): ?><span class="small muted"><?= (int)$l['duration_min'] ?> min</span><?php endif; ?>
            </a>
          </li>
        <?php endforeach; ?>
        <?php if (!$m['lessons']): ?><li class="muted small pad">No lessons in this module yet.</li><?php endif; ?>
      </ol>
    </div>
  <?php endforeach; ?>

  <?php if ($outline['quizzes']): ?>
    <div class="module card">
      <div class="module-head"><span class="module-num"><?= icon('quiz') ?></span><h3>Assessments</h3></div>
      <ol class="outline">
        <?php foreach ($outline['quizzes'] as $q): ?>
          <li class="<?= (int)$q['passed'] === 1 ? 'is-done' : '' ?> <?= $next && $next['type'] === 'quiz' && $next['id'] === (int)$q['id'] ? 'is-next' : '' ?>">
            <a href="<?= e(url('/quizzes/' . $q['id'])) ?>">
              <span class="status-dot"><?= (int)$q['passed'] === 1 ? icon('check') : icon('quiz') ?></span>
              <span class="outline-title"><?= e($q['title']) ?></span>
              <span class="small muted">
                <?php if ($q['best'] !== null): ?>Best <?= (int)$q['best'] ?>% · <?php endif; ?>Pass <?= (int)$q['pass_mark'] ?>%
              </span>
            </a>
          </li>
        <?php endforeach; ?>
      </ol>
    </div>
  <?php endif; ?>
</section>
