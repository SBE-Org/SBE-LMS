<form method="post" action="<?= e(url('/login')) ?>" class="card auth-card">
  <?= csrf_field() ?>
  <h1>Sign in</h1>
  <p class="muted">Use the work email and password your administrator gave you.</p>
  <?php if ($error): ?><div class="flash flash-error" role="alert"><?= e($error) ?></div><?php endif; ?>
  <label class="field">
    <span>Email</span>
    <input type="email" name="email" value="<?= e($email) ?>" autocomplete="username" required autofocus>
  </label>
  <label class="field">
    <span>Password</span>
    <input type="password" name="password" autocomplete="current-password" required>
  </label>
  <button class="btn btn-primary btn-block" type="submit">Sign in</button>
  <p class="muted small center">Forgot your password? Ask your team lead or administrator to reset it.</p>
</form>
<p class="center small"><a href="<?= e(url('/verify')) ?>">Verify a certificate</a></p>
