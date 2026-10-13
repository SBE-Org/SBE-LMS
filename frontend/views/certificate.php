<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Certificate · <?= e($cert['course_title']) ?></title>
<link rel="stylesheet" href="<?= e(asset('app.css')) ?>">
</head>
<body class="cert-body">
<div class="cert-toolbar no-print">
  <a class="btn btn-ghost" href="<?= e(url('/certificates')) ?>"><?= icon('arrow-left') ?>Back</a>
  <button class="btn btn-primary" type="button" onclick="window.print()"><?= icon('print') ?>Print or save as PDF</button>
</div>
<div class="certificate">
  <div class="cert-inner">
    <div class="cert-top">
      <span class="brand-mark brand-mark-lg">S</span>
      <div class="cert-org"><strong><?= e(config('company')) ?></strong><small><?= e(config('app_name')) ?></small></div>
    </div>
    <p class="cert-kicker">Certificate of Completion</p>
    <p class="cert-small">This certifies that</p>
    <h1 class="cert-name"><?= e($cert['learner_name']) ?></h1>
    <?php if ($cert['employee_id']): ?><p class="cert-small">Employee ID <?= e($cert['employee_id']) ?></p><?php endif; ?>
    <p class="cert-small">has successfully completed the training course</p>
    <h2 class="cert-course"><?= e($cert['course_title']) ?></h2>
    <div class="cert-foot">
      <div><span class="cert-line"></span><small>Date issued</small><strong><?= e(fmt_date($cert['issued_at'], 'j F Y')) ?></strong></div>
      <div class="cert-seal"><?= icon('award', 'icon') ?></div>
      <div><span class="cert-line"></span><small>Training Manager</small><strong><?= e(config('company')) ?></strong></div>
    </div>
    <p class="cert-verify">Certificate no. <strong><?= e($cert['code']) ?></strong> · Verify at <?= e($verifyUrl) ?></p>
  </div>
</div>
</body>
</html>
