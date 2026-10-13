<nav class="crumbs"><a href="<?= e(url('/admin/users')) ?>">People</a><span>/</span><span>Import</span></nav>
<div class="page-head"><div><h1>Import people from CSV</h1><p class="muted">Add a whole training batch at once. Existing people (same email) are updated, not duplicated.</p></div></div>

<?php if ($results === null): ?>
<form method="post" enctype="multipart/form-data" action="<?= e(url('/admin/users/import')) ?>" class="card form">
  <?= csrf_field() ?>
  <?php foreach ($errors as $err): ?><div class="flash flash-error" role="alert"><?= e($err) ?></div><?php endforeach; ?>
  <label class="field"><span>CSV file</span><input type="file" name="csv" accept=".csv,text/csv" required></label>
  <div class="help small">
    <p>The first row must be column names. <strong>name</strong> and <strong>email</strong> are required; the rest are optional:</p>
    <pre class="code">name,email,role,team,campaign,employee_id,password
Abebe Kebede,abebe.k@shaggar.com,agent,Inbound Customer Care,Telecom support,SHG-0451,
Tigist Haile,tigist.h@shaggar.com,team_lead,Outbound Sales,,SHG-0452,</pre>
    <p>Role is one of <code>agent</code>, <code>team_lead</code>, <code>trainer</code>, <code>admin</code> (default agent). Teams that don't exist are created. Empty passwords are generated and shown once after import. Excel: use <em>File → Save As → CSV UTF-8</em> so Amharic names are kept.</p>
  </div>
  <div class="actions"><button class="btn btn-primary" type="submit"><?= icon('upload') ?>Import</button></div>
</form>
<?php else: ?>
  <?php $created = array_filter($results, fn($r) => $r['status'] === 'Created'); ?>
  <div class="flash flash-success"><?= count($created) ?> created, <?= count(array_filter($results, fn($r) => $r['status'] === 'Updated')) ?> updated, <?= count(array_filter($results, fn($r) => str_starts_with($r['status'], 'Skipped'))) ?> skipped.</div>
  <?php if ($created): ?><div class="flash flash-info">Copy the temporary passwords now — they are not shown again. Everyone must choose their own password at first sign-in.</div><?php endif; ?>
  <div class="card table-wrap">
    <table class="table">
      <thead><tr><th>Row</th><th>Name</th><th>Email</th><th>Result</th><th>Temporary password</th></tr></thead>
      <tbody>
      <?php foreach ($results as $r): ?>
        <tr><td><?= (int)$r['line'] ?></td><td><?= e($r['name']) ?></td><td><?= e($r['email']) ?></td><td><?= str_starts_with($r['status'], 'Skipped') ? badge($r['status'], 'danger') : badge($r['status'], $r['status'] === 'Created' ? 'success' : 'info') ?></td><td><?= $r['password'] ? '<code>' . e($r['password']) . '</code>' : '—' ?></td></tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <p><a class="btn btn-ghost" href="<?= e(url('/admin/users')) ?>">Back to people</a></p>
<?php endif; ?>
