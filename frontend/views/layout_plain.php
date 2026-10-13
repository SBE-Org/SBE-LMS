<?php $pageTitle = isset($title) ? $title . ' · ' . config('app_name') : config('app_name'); ?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($pageTitle) ?></title>
<link rel="icon" href="<?= e(asset('favicon.svg')) ?>" type="image/svg+xml">
<link rel="stylesheet" href="<?= e(asset('app.css')) ?>">
</head>
<body class="auth-body">
<main class="auth">
  <div class="auth-brand">
    <span class="brand-mark brand-mark-lg">S</span>
    <div><strong><?= e(config('app_name')) ?></strong><small><?= e(config('company')) ?></small></div>
  </div>
  <?php if (session_status() === PHP_SESSION_ACTIVE): foreach (take_flashes() as $f): ?>
    <div class="flash flash-<?= e($f['type']) ?>"><?= e($f['message']) ?></div>
  <?php endforeach; endif; ?>
  <?= $content ?>
</main>
<script src="<?= e(asset('app.js')) ?>" defer></script>
</body>
</html>
