<div class="quiz-bar">
  <div>
    <p class="eyebrow"><?= e($course['title']) ?></p>
    <h1><?= e($quiz['title']) ?></h1>
  </div>
  <div class="quiz-bar-side">
    <span class="small muted"><span data-answered>0</span>/<?= count($questions) ?> answered</span>
    <?php if ($secondsLeft !== null): ?>
      <span class="timer" data-timer="<?= (int)$secondsLeft ?>" role="timer" aria-live="off"><?= icon('clock') ?><span data-timer-text>--:--</span></span>
    <?php endif; ?>
  </div>
</div>

<form method="post" action="<?= e(url('/attempts/' . $attempt['id'])) ?>" class="quiz-form" data-quiz-form data-total="<?= count($questions) ?>">
  <?= csrf_field() ?>
  <?php foreach ($questions as $n => $q): $multi = $q['type'] === 'multiple'; ?>
    <fieldset class="question card" data-question>
      <legend><span class="q-num"><?= $n + 1 ?></span><span class="q-body"><?= nl2br(e($q['body'])) ?></span></legend>
      <p class="small muted q-hint"><?= $multi ? 'Select all that apply' : 'Select one answer' ?> · <?= plural((int)$q['points'], 'point') ?></p>
      <div class="choices">
        <?php foreach ($q['choices'] as $c): ?>
          <label class="choice">
            <input type="<?= $multi ? 'checkbox' : 'radio' ?>" name="answers[<?= (int)$q['id'] ?>][]" value="<?= (int)$c['id'] ?>">
            <span><?= e($c['body']) ?></span>
          </label>
        <?php endforeach; ?>
      </div>
    </fieldset>
  <?php endforeach; ?>
  <div class="quiz-submit card">
    <p class="muted small">Check your answers, then submit. You cannot change them afterwards.</p>
    <button class="btn btn-primary" type="submit">Submit answers</button>
  </div>
</form>
