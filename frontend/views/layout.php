<?php
/** @var string $content */
try {
    $me = user();
} catch (Throwable) {
    $me = null;
}
$path = '/' . trim(substr(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/', strlen(base_url())), '/');
$active = function (string $prefix) use ($path): string {
    if ($prefix === '/') {
        return $path === '/' ? ' aria-current="page"' : '';
    }
    return str_starts_with($path, $prefix) ? ' aria-current="page"' : '';
};
$pageTitle = isset($title) ? $title . ' · ' . config('app_name') : config('app_name');
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($pageTitle) ?></title>
<link rel="icon" href="<?= e(asset('favicon.svg')) ?>" type="image/svg+xml">
<link rel="stylesheet" href="<?= e(asset('app.css')) ?>">
</head>
<body>
<?php if ($me): ?>
<div class="shell">
  <aside class="sidebar" id="sidebar">
    <a class="brand" href="<?= e(url('/')) ?>">
      <span class="brand-mark">S</span>
      <span class="brand-text"><strong><?= e(config('app_name')) ?></strong><small><?= e(config('company')) ?></small></span>
    </a>
    <nav class="nav">
      <p class="nav-label">Learn</p>
      <a href="<?= e(url('/')) ?>"<?= $active('/') ?>><?= icon('home') ?>Dashboard</a>
      <a href="<?= e(url('/courses')) ?>"<?= $active('/courses') ?: $active('/lessons') ?: $active('/quizzes') ?: $active('/attempts') ?>><?= icon('book') ?>Courses</a>
      <a href="<?= e(url('/certificates')) ?>"<?= $active('/certificates') ?>><?= icon('award') ?>Certificates</a>
      <?php if (has_role('admin', 'trainer', 'team_lead')): ?>
        <p class="nav-label">Track</p>
        <a href="<?= e(url('/reports')) ?>"<?= $active('/reports') ?>><?= icon('chart') ?>Reports</a>
      <?php endif; ?>
      <?php if (has_role('admin', 'trainer')): ?>
        <p class="nav-label">Build</p>
        <a href="<?= e(url('/manage/courses')) ?>"<?= $active('/manage') ?>><?= icon('edit') ?>Manage courses</a>
      <?php endif; ?>
      <?php if (has_role('admin')): ?>
        <p class="nav-label">Organisation</p>
        <a href="<?= e(url('/admin/users')) ?>"<?= $active('/admin/users') ?>><?= icon('users') ?>People</a>
        <a href="<?= e(url('/admin/teams')) ?>"<?= $active('/admin/teams') ?>><?= icon('team') ?>Teams</a>
      <?php endif; ?>
    </nav>
    <div class="me">
      <span class="avatar"><?= e(initials($me['name'])) ?></span>
      <span class="me-text"><strong><?= e($me['name']) ?></strong><small><?= e(ROLES[$me['role']] ?? $me['role']) ?><?= $me['team_name'] ? ' · ' . e($me['team_name']) : '' ?></small></span>
      <div class="me-actions">
        <a href="<?= e(url('/account/password')) ?>" class="icon-btn" title="Change password" aria-label="Change password"><?= icon('key') ?></a>
        <?= post_button('/logout', icon('logout'), 'icon-btn', null, [], 'Sign out') ?>
      </div>
    </div>
  </aside>
  <div class="main">
    <header class="topbar">
      <button class="icon-btn" type="button" data-toggle-nav aria-label="Open menu" aria-controls="sidebar"><?= icon('menu') ?></button>
      <a class="brand brand-small" href="<?= e(url('/')) ?>"><span class="brand-mark">S</span><strong><?= e(config('app_name')) ?></strong></a>
    </header>
    <main class="content">
      <?php foreach (take_flashes() as $f): ?>
        <div class="flash flash-<?= e($f['type']) ?>" role="status"><?= e($f['message']) ?><button type="button" class="flash-close" aria-label="Dismiss"><?= icon('x') ?></button></div>
      <?php endforeach; ?>
      <?= $content ?>
    </main>
  </div>
</div>
<div class="scrim" data-toggle-nav></div>
<?php else: ?>
<main class="plain">
  <?php foreach (take_flashes() as $f): ?>
    <div class="flash flash-<?= e($f['type']) ?>"><?= e($f['message']) ?></div>
  <?php endforeach; ?>
  <?= $content ?>
</main>
<?php endif; ?>
<script src="<?= e(asset('app.js')) ?>" defer></script>
</body>
</html>
