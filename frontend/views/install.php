<form method="post" action="<?= e(url('/install')) ?>" class="card auth-card">
  <?= csrf_field() ?>
  <h1>Set up the platform</h1>
  <p class="muted">This creates the database tables and the first administrator account. Database: <strong><?= e($driver === 'sqlite' ? 'SQLite (trial mode)' : 'MySQL / MariaDB') ?></strong>.</p>
  <?php foreach ($errors as $err): ?><div class="flash flash-error" role="alert"><?= e($err) ?></div><?php endforeach; ?>
  <label class="field"><span>Administrator name</span><input name="name" value="<?= e($old['name'] ?? '') ?>" required></label>
  <label class="field"><span>Administrator email</span><input type="email" name="email" value="<?= e($old['email'] ?? '') ?>" required></label>
  <label class="field"><span>Password <small class="muted">(at least 8 characters)</small></span><input type="password" name="password" minlength="8" autocomplete="new-password" required></label>
  <label class="check"><input type="checkbox" name="demo" value="1" checked> <span>Load demo data: 3 teams, 16 people and 4 BPO training courses with quizzes (demo password <code>Welcome@123</code>)</span></label>
  <button class="btn btn-primary btn-block" type="submit">Install</button>
</form>
