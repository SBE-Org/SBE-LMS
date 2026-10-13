<div class="card auth-card">
  <h1>Verify a certificate</h1>
  <p class="muted">Enter the certificate number printed at the bottom of the certificate.</p>
  <form method="get" action="<?= e(url('/verify')) ?>" class="verify-form">
    <input name="code" value="<?= e($code) ?>" placeholder="SHG-2026-XXXXXXXXXX" aria-label="Certificate number" required>
    <button class="btn btn-primary" type="submit">Check</button>
  </form>
  <?php if ($code !== ''): ?>
    <?php if ($cert): ?>
      <div class="verify-result ok">
        <?= icon('check', 'icon icon-lg') ?>
        <div>
          <strong>Valid certificate</strong>
          <p><?= e($cert['learner_name']) ?> completed <strong><?= e($cert['course_title']) ?></strong> on <?= e(fmt_date($cert['issued_at'], 'j F Y')) ?>.</p>
        </div>
      </div>
    <?php else: ?>
      <div class="verify-result bad"><?= icon('alert', 'icon icon-lg') ?><div><strong>Not found</strong><p>No certificate with this number was issued by <?= e(config('company')) ?>.</p></div></div>
    <?php endif; ?>
  <?php endif; ?>
</div>
<p class="center small"><a href="<?= e(url('/login')) ?>">Sign in</a></p>
