<div class="page-head">
  <div><h1>Change password</h1><p class="muted"><?= (int)$user['must_change_password'] === 1 ? 'You are using a temporary password. Choose your own to continue.' : 'Choose a password only you know.' ?></p></div>
</div>
<form method="post" action="<?= e(url('/account/password')) ?>" class="card form narrow">
  <?= csrf_field() ?>
  <?php foreach ($errors as $err): ?><div class="flash flash-error" role="alert"><?= e($err) ?></div><?php endforeach; ?>
  <label class="field"><span>Current password</span><input type="password" name="current" autocomplete="current-password" required></label>
  <label class="field"><span>New password <small class="muted">(at least 8 characters)</small></span><input type="password" name="new" minlength="8" autocomplete="new-password" required></label>
  <label class="field"><span>Repeat new password</span><input type="password" name="confirm" minlength="8" autocomplete="new-password" required></label>
  <div class="actions"><button class="btn btn-primary" type="submit">Save password</button></div>
</form>
