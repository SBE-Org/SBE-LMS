<?php $editing = (bool)$quiz['id']; ?>
<nav class="crumbs"><a href="<?= e(url('/manage/courses')) ?>">Manage courses</a><span>/</span><a href="<?= e(url('/manage/courses/' . $course['id'])) ?>"><?= e($course['title']) ?></a><span>/</span><span><?= $editing ? 'Quiz settings' : 'New quiz' ?></span></nav>
<div class="page-head"><div><h1><?= $editing ? 'Quiz settings' : 'New quiz' ?></h1></div></div>

<form method="post" action="<?= e(url($editing ? '/manage/quizzes/' . $quiz['id'] . '/edit' : '/manage/courses/' . $course['id'] . '/quizzes/new')) ?>" class="card form">
  <?= csrf_field() ?>
  <?php foreach ($errors as $err): ?><div class="flash flash-error" role="alert"><?= e($err) ?></div><?php endforeach; ?>
  <label class="field"><span>Title</span><input name="title" value="<?= e($quiz['title']) ?>" maxlength="200" required></label>
  <label class="field"><span>Instructions <small class="muted">(optional)</small></span><textarea name="description" rows="3"><?= e($quiz['description']) ?></textarea></label>
  <div class="grid-3">
    <label class="field"><span>Pass mark (%)</span><input type="number" name="pass_mark" min="0" max="100" value="<?= (int)$quiz['pass_mark'] ?>" required></label>
    <label class="field"><span>Time limit (minutes)</span><input type="number" name="time_limit_min" min="0" max="600" value="<?= e($quiz['time_limit_min']) ?>" placeholder="No limit"></label>
    <label class="field"><span>Maximum attempts</span><input type="number" name="max_attempts" min="0" max="50" value="<?= (int)$quiz['max_attempts'] ?>"><small class="muted">0 = unlimited</small></label>
  </div>
  <label class="check"><input type="checkbox" name="show_answers" value="1" <?= (int)$quiz['show_answers'] === 1 ? 'checked' : '' ?>> <span><strong>Show correct answers</strong> to learners after they submit</span></label>
  <label class="check"><input type="checkbox" name="shuffle_questions" value="1" <?= (int)$quiz['shuffle_questions'] === 1 ? 'checked' : '' ?>> <span><strong>Shuffle question order</strong> for each attempt</span></label>
  <div class="actions">
    <button class="btn btn-primary" type="submit"><?= $editing ? 'Save settings' : 'Create quiz' ?></button>
    <a class="btn btn-ghost" href="<?= e(url($editing ? '/manage/quizzes/' . $quiz['id'] : '/manage/courses/' . $course['id'])) ?>">Cancel</a>
  </div>
</form>

<?php if ($editing): ?>
<div class="card form danger-zone">
  <h2>Delete quiz</h2>
  <p class="muted small">Removes the quiz, its questions and every learner's results for it.</p>
  <?= post_button('/manage/quizzes/' . $quiz['id'] . '/delete', icon('trash') . 'Delete quiz', 'btn btn-danger', 'Delete this quiz and all its results? This cannot be undone.') ?>
</div>
<?php endif; ?>
