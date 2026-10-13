<div class="page-head"><div><h1>My certificates</h1><p class="muted">Print them or save them as PDF. Anyone can check a certificate is genuine on the verification page.</p></div></div>
<?php if (!$certificates): ?>
  <div class="empty-state card"><?= icon('award', 'icon icon-xl') ?><h3>No certificates yet</h3><p class="muted">Complete every lesson and pass every quiz in a course to earn its certificate.</p></div>
<?php else: ?>
<div class="cert-grid">
  <?php foreach ($certificates as $c): ?>
    <a class="cert-card card" href="<?= e(url('/certificates/' . $c['code'])) ?>">
      <span class="cert-card-icon"><?= icon('award', 'icon icon-lg') ?></span>
      <strong><?= e($c['title']) ?></strong>
      <small class="muted"><?= e(fmt_date($c['issued_at'])) ?></small>
      <code class="small"><?= e($c['code']) ?></code>
    </a>
  <?php endforeach; ?>
</div>
<?php endif; ?>
