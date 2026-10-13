<?php $editing = (bool)$lesson['id']; ?>
<nav class="crumbs"><a href="<?= e(url('/manage/courses')) ?>">Manage courses</a><span>/</span><a href="<?= e(url('/manage/courses/' . $course['id'])) ?>"><?= e($course['title']) ?></a><span>/</span><span><?= $editing ? 'Edit lesson' : 'New lesson' ?></span></nav>
<div class="page-head"><div><h1><?= $editing ? 'Edit lesson' : 'New lesson' ?></h1><p class="muted">Module: <?= e($module['title']) ?></p></div>
  <?php if ($editing): ?><a class="btn btn-ghost" href="<?= e(url('/lessons/' . $lesson['id'])) ?>"><?= icon('eye') ?>Preview</a><?php endif; ?>
</div>

<form method="post" enctype="multipart/form-data" action="<?= e(url($editing ? '/manage/lessons/' . $lesson['id'] . '/edit' : '/manage/modules/' . $module['id'] . '/lessons/new')) ?>" class="card form" data-lesson-form>
  <?= csrf_field() ?>
  <?php foreach ($errors as $err): ?><div class="flash flash-error" role="alert"><?= e($err) ?></div><?php endforeach; ?>

  <label class="field"><span>Title</span><input name="title" value="<?= e($lesson['title']) ?>" maxlength="200" required></label>

  <div class="grid-3">
    <label class="field"><span>Lesson type</span>
      <select name="type" data-lesson-type>
        <option value="text" <?= $lesson['type'] === 'text' ? 'selected' : '' ?>>Reading</option>
        <option value="video" <?= $lesson['type'] === 'video' ? 'selected' : '' ?>>Video</option>
        <option value="file" <?= $lesson['type'] === 'file' ? 'selected' : '' ?>>Document / file</option>
      </select>
    </label>
    <label class="field"><span>Module</span>
      <select name="module_id">
        <?php foreach ($modules as $m): ?><option value="<?= (int)$m['id'] ?>" <?= (int)$m['id'] === (int)$lesson['module_id'] ? 'selected' : '' ?>><?= e($m['title']) ?></option><?php endforeach; ?>
      </select>
    </label>
    <label class="field"><span>Duration (minutes)</span><input type="number" name="duration_min" min="0" max="600" value="<?= e($lesson['duration_min']) ?>"></label>
  </div>

  <div class="field" data-show-for="video">
    <label for="video_url"><span>Video link</span></label>
    <input id="video_url" name="video_url" value="<?= e($lesson['video_url']) ?>" placeholder="https://www.youtube.com/watch?v=…  or a Vimeo / .mp4 link">
    <small class="muted">Or upload the video file below. On slow connections, uploading to your own server is often faster for learners than YouTube.</small>
  </div>

  <div class="field" data-show-for="video file">
    <label for="file"><span>Upload file <small class="muted">— PDF, Word, PowerPoint, Excel, MP4, MP3, images · up to <?= (int)config('max_upload_mb') ?> MB</small></span></label>
    <input id="file" type="file" name="file" accept=".<?= implode(',.', array_keys(UPLOAD_TYPES)) ?>">
    <?php if (!empty($lesson['file_name'])): ?>
      <p class="small">Current file: <strong><?= e($lesson['file_name']) ?></strong> · <label class="check-inline"><input type="checkbox" name="remove_file" value="1"> remove it</label></p>
    <?php endif; ?>
  </div>

  <label class="field"><span>Lesson text <small class="muted">— shown below any video or file</small></span>
    <textarea name="body" rows="14" class="mono"><?= e($lesson['body']) ?></textarea>
  </label>
  <details class="help small">
    <summary>Formatting help</summary>
    <p><code># Heading</code> · <code>## Sub-heading</code> · <code>**bold**</code> · <code>*italic*</code> · <code>- bullet</code> · <code>1. numbered</code> · <code>&gt; tip or note</code> · <code>[link text](https://…)</code>. Leave a blank line between paragraphs.</p>
  </details>

  <div class="actions">
    <button class="btn btn-primary" type="submit"><?= $editing ? 'Save lesson' : 'Add lesson' ?></button>
    <a class="btn btn-ghost" href="<?= e(url('/manage/courses/' . $course['id'])) ?>">Cancel</a>
  </div>
</form>
