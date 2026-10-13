<div class="empty-state error-page">
  <p class="error-code"><?= (int)$code ?></p>
  <h1><?= e($title) ?></h1>
  <?php if (!empty($message)): ?><p class="muted"><?= e($message) ?></p><?php endif; ?>
  <p><a class="btn btn-primary" href="<?= e(url('/')) ?>"><?= icon('home') ?>Back to dashboard</a></p>
</div>
