<div class="page-head">
  <div><h1>People</h1><p class="muted"><?= plural(count($users), 'person', 'people') ?> shown</p></div>
  <div class="actions">
    <a class="btn btn-ghost" href="<?= e(url('/admin/users/import')) ?>"><?= icon('upload') ?>Import CSV</a>
    <a class="btn btn-primary" href="<?= e(url('/admin/users/new')) ?>"><?= icon('plus') ?>Add person</a>
  </div>
</div>

<form class="toolbar" method="get" action="<?= e(url('/admin/users')) ?>">
  <label class="search"><?= icon('search') ?><input type="search" name="q" value="<?= e($q) ?>" placeholder="Name, email or employee ID" aria-label="Search people"></label>
  <select name="role" aria-label="Role" data-autosubmit><option value="">All roles</option><?php foreach (ROLES as $k => $label): ?><option value="<?= $k ?>" <?= $role === $k ? 'selected' : '' ?>><?= e($label) ?></option><?php endforeach; ?></select>
  <select name="team" aria-label="Team" data-autosubmit><option value="">All teams</option><?php foreach ($teams as $t): ?><option value="<?= (int)$t['id'] ?>" <?= $team === (int)$t['id'] ? 'selected' : '' ?>><?= e($t['name']) ?></option><?php endforeach; ?></select>
  <select name="status" aria-label="Status" data-autosubmit><?php foreach (['active' => 'Active', 'inactive' => 'Deactivated', 'all' => 'Everyone'] as $k => $label): ?><option value="<?= $k ?>" <?= $status === $k ? 'selected' : '' ?>><?= e($label) ?></option><?php endforeach; ?></select>
  <button class="btn btn-ghost" type="submit">Filter</button>
</form>

<div class="card table-wrap">
  <table class="table">
    <thead><tr><th>Name</th><th>Role</th><th>Team</th><th>Courses</th><th>Last sign-in</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($users as $u): ?>
      <tr class="<?= (int)$u['active'] === 1 ? '' : 'is-muted' ?>">
        <td><span class="person"><span class="avatar avatar-sm"><?= e(initials($u['name'])) ?></span><span><strong><?= e($u['name']) ?></strong><br><small class="muted"><?= e($u['email']) ?><?= $u['employee_id'] ? ' · ' . e($u['employee_id']) : '' ?></small></span></span></td>
        <td><?= e(ROLES[$u['role']] ?? $u['role']) ?><?= (int)$u['active'] === 1 ? '' : ' ' . badge('Deactivated', 'neutral') ?></td>
        <td class="small"><?= e($u['team_name'] ?: '—') ?></td>
        <td class="small"><?= (int)$u['completed'] ?>/<?= (int)$u['enrolments'] ?> done</td>
        <td class="small muted"><?= $u['last_login_at'] ? e(fmt_datetime($u['last_login_at'])) : 'Never' ?></td>
        <td class="right nowrap">
          <a class="btn btn-ghost btn-sm" href="<?= e(url('/reports/users/' . $u['id'])) ?>"><?= icon('chart') ?>Progress</a>
          <a class="btn btn-ghost btn-sm" href="<?= e(url('/admin/users/' . $u['id'] . '/edit')) ?>"><?= icon('edit') ?>Edit</a>
        </td>
      </tr>
    <?php endforeach; ?>
    <?php if (!$users): ?><tr><td colspan="6" class="muted center pad">Nobody matches these filters.</td></tr><?php endif; ?>
    </tbody>
  </table>
</div>
