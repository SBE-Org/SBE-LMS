<?php
$fileUrl = url('/lessons/' . $lesson['id'] . '/file');
$kind = $lesson['file_path'] ? file_kind($lesson['file_name'] ?: $lesson['file_path']) : null;
?>
<nav class="crumbs"><a href="<?= e(url('/courses')) ?>">Courses</a><span>/</span><a href="<?= e(url('/courses/' . $course['id'])) ?>"><?= e($course['title']) ?></a><span>/</span><span><?= e($lesson['module_title']) ?></span></nav>

<div class="lesson-layout">
  <article class="lesson card">
    <header class="lesson-head">
      <p class="eyebrow"><?= e($lesson['module_title']) ?></p>
      <h1><?= e($lesson['title']) ?></h1>
      <?php if ($lesson['duration_min']): ?><p class="muted small"><?= icon('clock', 'icon icon-inline') ?> <?= (int)$lesson['duration_min'] ?> min</p><?php endif; ?>
    </header>

    <?php if ($lesson['video_url']): ?>
      <?= video_embed($lesson['video_url']) ?>
    <?php endif; ?>

    <?php if ($lesson['file_path']): ?>
      <?php if ($kind === 'video'): ?>
        <div class="video"><video controls preload="metadata" src="<?= e($fileUrl) ?>"></video></div>
      <?php elseif ($kind === 'audio'): ?>
        <audio controls preload="metadata" src="<?= e($fileUrl) ?>" class="audio"></audio>
      <?php elseif ($kind === 'image'): ?>
        <img class="lesson-image" src="<?= e($fileUrl) ?>" alt="<?= e($lesson['title']) ?>">
      <?php elseif ($kind === 'pdf'): ?>
        <iframe class="pdf-frame" src="<?= e($fileUrl) ?>" title="<?= e($lesson['file_name']) ?>"></iframe>
      <?php endif; ?>
      <p class="file-row"><?= icon('file') ?> <span><?= e($lesson['file_name']) ?></span>
        <a class="btn btn-ghost btn-sm" href="<?= e(url('/lessons/' . $lesson['id'] . '/file', ['download' => 1])) ?>"><?= icon('download') ?>Download</a></p>
    <?php endif; ?>

    <div class="prose"><?= render_text($lesson['body']) ?></div>

    <footer class="lesson-foot">
      <?php if ($prev): ?>
        <a class="btn btn-ghost" href="<?= e(url('/lessons/' . $prev['id'])) ?>"><?= icon('arrow-left') ?>Previous</a>
      <?php else: ?><span></span><?php endif; ?>

      <?php if ($enrolled && !$done): ?>
        <form method="post" action="<?= e(url('/lessons/' . $lesson['id'] . '/complete')) ?>">
          <?= csrf_field() ?>
          <?php if ($next): ?><input type="hidden" name="next" value="<?= (int)$next['id'] ?>"><?php endif; ?>
          <button class="btn btn-primary" type="submit"><?= icon('check') ?>Mark complete<?= $next ? ' & continue' : '' ?></button>
        </form>
      <?php elseif ($next): ?>
        <a class="btn btn-primary" href="<?= e(url('/lessons/' . $next['id'])) ?>">Next lesson <?= icon('arrow-right') ?></a>
      <?php elseif ($outline['next'] && $outline['next']['type'] === 'quiz'): ?>
        <a class="btn btn-primary" href="<?= e(url('/quizzes/' . $outline['next']['id'])) ?>">Take the quiz <?= icon('arrow-right') ?></a>
      <?php else: ?>
        <a class="btn btn-primary" href="<?= e(url('/courses/' . $course['id'])) ?>">Back to course</a>
      <?php endif; ?>
    </footer>
    <?php if ($done): ?><p class="center small text-success"><?= icon('check', 'icon icon-inline') ?> You completed this lesson.</p><?php endif; ?>
  </article>

  <aside class="lesson-side card">
    <div class="lesson-side-head">
      <strong><?= e($course['title']) ?></strong>
      <?php if ($enrolled): ?><?= progress_bar((int)$progress['pct']) ?><small class="muted"><?= (int)$progress['pct'] ?>% complete</small><?php endif; ?>
    </div>
    <?php foreach ($outline['modules'] as $m): if (!$m['lessons']) continue; ?>
      <p class="side-module"><?= e($m['title']) ?></p>
      <ol class="outline outline-compact">
        <?php foreach ($m['lessons'] as $l): ?>
          <li class="<?= $l['completed_at'] ? 'is-done' : '' ?> <?= (int)$l['id'] === (int)$lesson['id'] ? 'is-current' : '' ?>">
            <a href="<?= e(url('/lessons/' . $l['id'])) ?>"<?= (int)$l['id'] === (int)$lesson['id'] ? ' aria-current="page"' : '' ?>>
              <span class="status-dot"><?= $l['completed_at'] ? icon('check') : lesson_icon($l['type']) ?></span>
              <span class="outline-title"><?= e($l['title']) ?></span>
            </a>
          </li>
        <?php endforeach; ?>
      </ol>
    <?php endforeach; ?>
    <?php if ($outline['quizzes']): ?>
      <p class="side-module">Assessments</p>
      <ol class="outline outline-compact">
        <?php foreach ($outline['quizzes'] as $q): ?>
          <li class="<?= (int)$q['passed'] === 1 ? 'is-done' : '' ?>"><a href="<?= e(url('/quizzes/' . $q['id'])) ?>"><span class="status-dot"><?= (int)$q['passed'] === 1 ? icon('check') : icon('quiz') ?></span><span class="outline-title"><?= e($q['title']) ?></span></a></li>
        <?php endforeach; ?>
      </ol>
    <?php endif; ?>
  </aside>
</div>
