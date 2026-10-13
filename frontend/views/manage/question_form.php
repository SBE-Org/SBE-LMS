<?php
$editing = (bool)$question['id'];
$rows = $question['type'] === 'truefalse' ? [] : $choices;
while (count($rows) < 4) {
    $rows[] = ['body' => '', 'is_correct' => 0];
}
$tfAnswer = 'true';
if ($question['type'] === 'truefalse') {
    foreach ($choices as $c) {
        if ((int)$c['is_correct'] === 1) {
            $tfAnswer = strtolower($c['body']) === 'false' ? 'false' : 'true';
        }
    }
}
?>
<nav class="crumbs"><a href="<?= e(url('/manage/courses/' . $course['id'])) ?>"><?= e($course['title']) ?></a><span>/</span><a href="<?= e(url('/manage/quizzes/' . $quiz['id'])) ?>"><?= e($quiz['title']) ?></a><span>/</span><span><?= $editing ? 'Edit question' : 'New question' ?></span></nav>
<div class="page-head"><div><h1><?= $editing ? 'Edit question' : 'New question' ?></h1></div></div>

<form method="post" action="<?= e(url($editing ? '/manage/questions/' . $question['id'] . '/edit' : '/manage/quizzes/' . $quiz['id'] . '/questions/new')) ?>" class="card form" data-question-form>
  <?= csrf_field() ?>
  <?php foreach ($errors as $err): ?><div class="flash flash-error" role="alert"><?= e($err) ?></div><?php endforeach; ?>

  <label class="field"><span>Question</span><textarea name="body" rows="3" required><?= e($question['body']) ?></textarea></label>
  <div class="grid-2">
    <label class="field"><span>Type</span>
      <select name="type" data-question-type>
        <option value="single" <?= $question['type'] === 'single' ? 'selected' : '' ?>>Single answer (radio buttons)</option>
        <option value="multiple" <?= $question['type'] === 'multiple' ? 'selected' : '' ?>>Multiple answers (checkboxes)</option>
        <option value="truefalse" <?= $question['type'] === 'truefalse' ? 'selected' : '' ?>>True / false</option>
      </select>
    </label>
    <label class="field"><span>Points</span><input type="number" name="points" min="1" max="100" value="<?= (int)$question['points'] ?>"></label>
  </div>

  <fieldset class="field" data-show-for="single multiple">
    <legend class="label">Answer options <small class="muted">— tick the correct one(s); empty rows are ignored</small></legend>
    <div class="choice-editor" data-choice-rows>
      <?php foreach ($rows as $i => $c): ?>
        <div class="choice-row">
          <input type="checkbox" name="correct[]" value="<?= $i ?>" <?= (int)$c['is_correct'] === 1 ? 'checked' : '' ?> aria-label="Correct answer">
          <input name="choice[<?= $i ?>]" value="<?= e($c['body']) ?>" placeholder="Option <?= $i + 1 ?>" maxlength="500">
        </div>
      <?php endforeach; ?>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" data-add-choice><?= icon('plus') ?>Add option</button>
  </fieldset>

  <fieldset class="field" data-show-for="truefalse">
    <legend class="label">Correct answer</legend>
    <label class="check"><input type="radio" name="tf_answer" value="true" <?= $tfAnswer === 'true' ? 'checked' : '' ?>> <span>True</span></label>
    <label class="check"><input type="radio" name="tf_answer" value="false" <?= $tfAnswer === 'false' ? 'checked' : '' ?>> <span>False</span></label>
  </fieldset>

  <label class="field"><span>Explanation <small class="muted">(optional) — shown after submitting, if answers are shown</small></span><textarea name="explanation" rows="2"><?= e($question['explanation'] ?? '') ?></textarea></label>

  <div class="actions">
    <button class="btn btn-primary" type="submit" name="then" value="done"><?= $editing ? 'Save question' : 'Save' ?></button>
    <?php if (!$editing): ?><button class="btn btn-ghost" type="submit" name="then" value="another">Save and add another</button><?php endif; ?>
    <a class="btn btn-ghost" href="<?= e(url('/manage/quizzes/' . $quiz['id'])) ?>">Cancel</a>
  </div>
</form>
