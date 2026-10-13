<?php $editing = (bool)$team['id']; ?>
<nav class="crumbs"><a href="<?= e(url('/admin/teams')) ?>">Teams</a><span>/</span><span><?= $editing ? e($team['name']) : 'New team' ?></span></nav>
<div class="page-head"><div><h1><?= $editing ? 'Edit team' : 'New team' ?></h1></div></div>

<form method="post" action="<?= e(url($editing ? '/admin/teams/' . $team['id'] . '/edit' : '/admin/teams/new')) ?>" class="card form">
  <?= csrf_field() ?>
  <?php foreach ($errors as $err): ?><div class="flash flash-error" role="alert"><?= e($err) ?></div><?php endforeach; ?>
  <div class="grid-2">
    <label class="field"><span>Team name</span><input name="name" value="<?= e($team['name']) ?>" maxlength="120" required></label>
    <label class="field"><span>Campaign / client <small class="muted">(optional)</small></span><input name="campaign" value="<?= e($team['campaign']) ?>" maxlength="120"></label>
  </div>
  <label class="field"><span>Team lead <small class="muted">— sees reports for this team</small></span>
    <select name="lead_id">
      <option value="">No team lead</option>
      <?php foreach ($leads as $l): ?><option value="<?= (int)$l['id'] ?>" <?= (int)$team['lead_id'] === (int)$l['id'] ? 'selected' : '' ?>><?= e($l['name']) ?> (<?= e(ROLES[$l['role']] ?? $l['role']) ?>)</option><?php endforeach; ?>
    </select>
    <small class="muted">Only people with the Team Lead, Trainer or Administrator role are listed.</small>
  </label>
  <div class="actions">
    <button class="btn btn-primary" type="submit"><?= $editing ? 'Save' : 'Create team' ?></button>
    <a class="btn btn-ghost" href="<?= e(url('/admin/teams')) ?>">Cancel</a>
  </div>
</form>

<?php if ($editing): ?>
<section class="section">
  <h2>Members (<?= count($members) ?>)</h2>
  <p class="muted small">Change a person's team on their profile in <a href="<?= e(url('/admin/users')) ?>">People</a>.</p>
  <div class="card list">
    <?php foreach ($members as $m): ?>
      <a class="list-row" href="<?= e(url('/admin/users/' . $m['id'] . '/edit')) ?>"><span class="avatar avatar-sm"><?= e(initials($m['name'])) ?></span><span class="list-main"><strong><?= e($m['name']) ?></strong><small class="muted"><?= e($m['email']) ?> · <?= e(ROLES[$m['role']] ?? $m['role']) ?></small></span></a>
    <?php endforeach; ?>
    <?php if (!$members): ?><p class="muted pad">No members yet.</p><?php endif; ?>
  </div>
</section>
<div class="card form danger-zone">
  <h2>Delete team</h2>
  <p class="muted small">Members are kept but will have no team. Their courses and progress are not affected.</p>
  <?= post_button('/admin/teams/' . $team['id'] . '/delete', icon('trash') . 'Delete team', 'btn btn-danger', 'Delete the team “' . $team['name'] . '”?') ?>
</div>
<?php endif; ?>
