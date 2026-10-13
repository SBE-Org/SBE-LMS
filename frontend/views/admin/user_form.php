<?php $editing = (bool)$u['id']; ?>
<nav class="crumbs"><a href="<?= e(url('/admin/users')) ?>">People</a><span>/</span><span><?= $editing ? e($u['name']) : 'Add person' ?></span></nav>
<div class="page-head"><div><h1><?= $editing ? 'Edit person' : 'Add person' ?></h1></div></div>

<form method="post" action="<?= e(url($editing ? '/admin/users/' . $u['id'] . '/edit' : '/admin/users/new')) ?>" class="card form">
  <?= csrf_field() ?>
  <?php foreach ($errors as $err): ?><div class="flash flash-error" role="alert"><?= e($err) ?></div><?php endforeach; ?>
  <div class="grid-2">
    <label class="field"><span>Full name</span><input name="name" value="<?= e($u['name']) ?>" maxlength="120" required></label>
    <label class="field"><span>Work email <small class="muted">— used to sign in</small></span><input type="email" name="email" value="<?= e($u['email']) ?>" maxlength="190" required></label>
  </div>
  <div class="grid-3">
    <label class="field"><span>Role</span>
      <select name="role">
        <?php foreach (ROLES as $k => $label): ?><option value="<?= $k ?>" <?= $u['role'] === $k ? 'selected' : '' ?>><?= e($label) ?></option><?php endforeach; ?>
      </select>
    </label>
    <label class="field"><span>Team</span>
      <select name="team_id">
        <option value="">No team</option>
        <?php foreach ($teams as $t): ?><option value="<?= (int)$t['id'] ?>" <?= (int)$u['team_id'] === (int)$t['id'] ? 'selected' : '' ?>><?= e($t['name']) ?><?= $t['campaign'] ? ' — ' . e($t['campaign']) : '' ?></option><?php endforeach; ?>
      </select>
    </label>
    <label class="field"><span>Employee ID <small class="muted">(optional)</small></span><input name="employee_id" value="<?= e($u['employee_id']) ?>" maxlength="50"></label>
  </div>
  <details class="help small" open>
    <summary>What each role can do</summary>
    <ul>
      <li><strong>Agent</strong> — takes assigned courses and quizzes, earns certificates.</li>
      <li><strong>Team Lead</strong> — everything an agent can do, plus reports for the teams they lead (set the lead on the team page).</li>
      <li><strong>Trainer</strong> — builds courses and quizzes, enrols people and teams, sees all reports.</li>
      <li><strong>Administrator</strong> — everything, plus managing people and teams.</li>
    </ul>
  </details>
  <label class="field"><span><?= $editing ? 'Set a new password' : 'Password' ?> <small class="muted">— <?= $editing ? 'leave empty to keep the current one' : 'leave empty to generate one' ?>; they must change it at sign-in</small></span>
    <input type="text" name="password" minlength="8" autocomplete="off" placeholder="<?= $editing ? '••••••••' : 'Generate automatically' ?>">
  </label>
  <?php if ($editing): ?>
    <label class="check"><input type="checkbox" name="active" value="1" <?= (int)$u['active'] === 1 ? 'checked' : '' ?>> <span><strong>Active</strong> — untick to block sign-in (for people who have left). Their records are kept.</span></label>
  <?php endif; ?>
  <div class="actions">
    <button class="btn btn-primary" type="submit"><?= $editing ? 'Save' : 'Add person' ?></button>
    <a class="btn btn-ghost" href="<?= e(url('/admin/users')) ?>">Cancel</a>
  </div>
</form>
