<div class="page-head">
  <div><h1>Teams</h1><p class="muted">Group agents by campaign or floor. Assign courses to a whole team and give team leads their own reports.</p></div>
  <a class="btn btn-primary" href="<?= e(url('/admin/teams/new')) ?>"><?= icon('plus') ?>New team</a>
</div>
<?php if (!$teams): ?>
  <div class="empty-state card"><?= icon('team', 'icon icon-xl') ?><h3>No teams yet</h3><a class="btn btn-primary" href="<?= e(url('/admin/teams/new')) ?>">Create a team</a></div>
<?php else: ?>
<div class="card table-wrap">
  <table class="table">
    <thead><tr><th>Team</th><th>Team lead</th><th>People</th><th>Team courses</th><th></th></tr></thead>
    <tbody>
    <?php foreach ($teams as $t): ?>
      <tr>
        <td><strong><?= e($t['name']) ?></strong><?php if ($t['campaign']): ?><br><small class="muted"><?= e($t['campaign']) ?></small><?php endif; ?></td>
        <td><?= e($t['lead_name'] ?: '—') ?></td>
        <td><a href="<?= e(url('/admin/users', ['team' => $t['id']])) ?>"><?= (int)$t['members'] ?></a></td>
        <td><?= (int)$t['courses'] ?></td>
        <td class="right nowrap">
          <a class="btn btn-ghost btn-sm" href="<?= e(url('/reports', ['team' => $t['id']])) ?>"><?= icon('chart') ?>Report</a>
          <a class="btn btn-ghost btn-sm" href="<?= e(url('/admin/teams/' . $t['id'] . '/edit')) ?>"><?= icon('edit') ?>Edit</a>
        </td>
      </tr>
    <?php endforeach; ?>
    </tbody>
  </table>
</div>
<?php endif; ?>
