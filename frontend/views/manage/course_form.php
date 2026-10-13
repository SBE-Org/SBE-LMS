<nav class="crumbs"><a href="<?= e(url('/manage/courses')) ?>">Manage courses</a><span>/</span><?php if ($course['id']): ?><a href="<?= e(url('/manage/courses/' . $course['id'])) ?>"><?= e($course['title']) ?></a><span>/</span><span>Settings</span><?php else: ?><span>New course</span><?php endif; ?></nav>
<div class="page-head"><div><h1><?= $course['id'] ? 'Course settings' : 'New course' ?></h1></div></div>

<form method="post" action="<?= e(url($course['id'] ? '/manage/courses/' . $course['id'] . '/edit' : '/manage/courses/new')) ?>" class="card form">
  <?= csrf_field() ?>
  <?php foreach ($errors as $err): ?><div class="flash flash-error" role="alert"><?= e($err) ?></div><?php endforeach; ?>
  <label class="field"><span>Title</span><input name="title" value="<?= e($course['title']) ?>" maxlength="200" required></label>
  <label class="field"><span>Summary <small class="muted">— shown on the course card and page</small></span><textarea name="summary" rows="4"><?= e($course['summary']) ?></textarea></label>
  <div class="grid-2">
    <label class="field"><span>Category</span>
      <input name="category" value="<?= e($course['category']) ?>" list="categories" placeholder="e.g. Onboarding, Compliance, Sales">
      <datalist id="categories"><?php foreach ($categories as $c): ?><option value="<?= e($c) ?>"><?php endforeach; ?></datalist>
    </label>
    <label class="field"><span>Status</span>
      <select name="status">
        <?php foreach (['draft' => 'Draft — hidden from learners', 'published' => 'Published — visible to enrolled learners', 'archived' => 'Archived — hidden, results kept'] as $k => $label): ?>
          <option value="<?= $k ?>" <?= $course['status'] === $k ? 'selected' : '' ?>><?= e($label) ?></option>
        <?php endforeach; ?>
      </select>
    </label>
  </div>
  <label class="check"><input type="checkbox" name="self_enrol" value="1" <?= (int)$course['self_enrol'] === 1 ? 'checked' : '' ?>> <span><strong>Open to everyone</strong> — any signed-in person can join without being assigned</span></label>
  <label class="check"><input type="checkbox" name="certificate_enabled" value="1" <?= (int)$course['certificate_enabled'] === 1 ? 'checked' : '' ?>> <span><strong>Issue a certificate</strong> when a learner finishes every lesson and passes every quiz</span></label>
  <div class="actions">
    <button class="btn btn-primary" type="submit"><?= $course['id'] ? 'Save changes' : 'Create course' ?></button>
    <a class="btn btn-ghost" href="<?= e(url($course['id'] ? '/manage/courses/' . $course['id'] : '/manage/courses')) ?>">Cancel</a>
  </div>
</form>

<?php if ($course['id']): ?>
<form method="post" action="<?= e(url('/manage/courses/' . $course['id'] . '/delete')) ?>" class="card form danger-zone">
  <?= csrf_field() ?>
  <h2>Delete course</h2>
  <p class="muted small">This permanently removes the course with its lessons, quizzes, enrolments, results and certificates. To keep results, set the status to Archived instead.</p>
  <label class="field"><span>Type the course title to confirm</span><input name="confirm_title" autocomplete="off"></label>
  <div class="actions"><button class="btn btn-danger" type="submit"><?= icon('trash') ?>Delete permanently</button></div>
</form>
<?php endif; ?>
