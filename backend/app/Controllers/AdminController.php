<?php
declare(strict_types=1);

namespace App\Controllers;

use DB;
use Progress;

/** People and teams, for administrators. */
final class AdminController
{
    public function __construct()
    {
        require_role('admin');
    }

    // ---- users ------------------------------------------------------------

    public function users(): string
    {
        $q = (string)input('q');
        $role = (string)input('role');
        $team = input_int('team');
        $status = (string)input('status', 'active');

        $where = [];
        $params = [];
        if ($q !== '') {
            $where[] = '(u.name LIKE ? OR u.email LIKE ? OR u.employee_id LIKE ?)';
            array_push($params, "%$q%", "%$q%", "%$q%");
        }
        if (isset(ROLES[$role])) {
            $where[] = 'u.role = ?';
            $params[] = $role;
        }
        if ($team) {
            $where[] = 'u.team_id = ?';
            $params[] = $team;
        }
        if ($status === 'active') {
            $where[] = 'u.active = 1';
        } elseif ($status === 'inactive') {
            $where[] = 'u.active = 0';
        }
        $users = DB::all(
            'SELECT u.*, t.name AS team_name,
                    (SELECT COUNT(*) FROM enrolments e WHERE e.user_id = u.id) AS enrolments,
                    (SELECT COUNT(*) FROM enrolments e WHERE e.user_id = u.id AND e.completed_at IS NOT NULL) AS completed
             FROM users u LEFT JOIN teams t ON t.id = u.team_id ' .
            ($where ? 'WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY u.name',
            $params
        );
        $teams = DB::all('SELECT id, name FROM teams ORDER BY name');
        return view('admin/users', ['users' => $users, 'teams' => $teams, 'q' => $q, 'role' => $role, 'team' => $team, 'status' => $status, 'title' => 'People']);
    }

    public function userForm(?string $id = null): string
    {
        $user = $id
            ? (DB::one('SELECT * FROM users WHERE id = ?', [(int)$id]) ?? abort(404))
            : ['id' => null, 'name' => '', 'email' => '', 'role' => 'agent', 'team_id' => null, 'employee_id' => '', 'active' => 1];
        return view('admin/user_form', ['u' => $user, 'teams' => DB::all('SELECT id, name, campaign FROM teams ORDER BY name'), 'errors' => [], 'newPassword' => null, 'title' => $id ? 'Edit person' : 'Add person']);
    }

    public function userSave(?string $id = null): string
    {
        $existing = $id ? (DB::one('SELECT * FROM users WHERE id = ?', [(int)$id]) ?? abort(404)) : null;
        $data = [
            'name' => mb_substr((string)input('name'), 0, 120),
            'email' => strtolower(mb_substr((string)input('email'), 0, 190)),
            'role' => isset(ROLES[input('role')]) ? input('role') : 'agent',
            'team_id' => input_int('team_id') ?: null,
            'employee_id' => mb_substr((string)input('employee_id'), 0, 50) ?: null,
            'active' => $existing ? checked('active') : 1,
        ];
        $password = (string)($_POST['password'] ?? '');
        $errors = [];
        if ($data['name'] === '') {
            $errors[] = 'Enter a name.';
        }
        if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
            $errors[] = 'Enter a valid email address.';
        } elseif (DB::val('SELECT id FROM users WHERE email = ? AND id <> ?', [$data['email'], $existing['id'] ?? 0])) {
            $errors[] = 'Another person already uses that email address.';
        }
        if ($password !== '' && strlen($password) < 8) {
            $errors[] = 'Passwords must be at least 8 characters.';
        }
        if ($data['team_id'] && !DB::val('SELECT 1 FROM teams WHERE id = ?', [$data['team_id']])) {
            $data['team_id'] = null;
        }
        if ($existing && (int)$existing['id'] === uid()) {
            // Avoid locking yourself out
            if ($data['role'] !== 'admin' || $data['active'] !== 1) {
                $errors[] = 'You cannot remove your own administrator role or deactivate your own account.';
            }
        }
        if ($errors) {
            return view('admin/user_form', ['u' => array_merge($existing ?? ['id' => null], $data), 'teams' => DB::all('SELECT id, name, campaign FROM teams ORDER BY name'), 'errors' => $errors, 'newPassword' => null, 'title' => $existing ? 'Edit person' : 'Add person']);
        }

        $generated = null;
        if ($existing) {
            if ($password !== '') {
                $data['password_hash'] = password_hash($password, PASSWORD_DEFAULT);
                $data['must_change_password'] = 1;
            }
            DB::update('users', $data, 'id = ?', [$existing['id']]);
            $userId = (int)$existing['id'];
        } else {
            if ($password === '') {
                $password = $generated = random_password();
            }
            $userId = DB::insert('users', $data + [
                'password_hash' => password_hash($password, PASSWORD_DEFAULT),
                'must_change_password' => 1,
                'created_at' => now(),
            ]);
        }
        $added = Progress::applyTeamCourses($userId);

        if ($generated) {
            flash('success', 'Account created for ' . $data['name'] . '. Temporary password: ' . $generated . ' — share it privately; they will be asked to change it at first sign-in.');
        } else {
            flash('success', 'Saved ' . $data['name'] . '.' . ($password !== '' ? ' They will be asked to change the new password at next sign-in.' : ''));
        }
        if ($added) {
            flash('info', plural($added, 'team course') . ' assigned automatically.');
        }
        redirect('/admin/users');
    }

    public function importForm(): string
    {
        return view('admin/import', ['results' => null, 'errors' => [], 'title' => 'Import people']);
    }

    /**
     * CSV columns (header row required): name, email, role, team, campaign, employee_id, password
     * Only name and email are required. Unknown teams are created.
     */
    public function import(): string
    {
        $file = $_FILES['csv'] ?? null;
        if (!$file || $file['error'] !== UPLOAD_ERR_OK) {
            return view('admin/import', ['results' => null, 'errors' => ['Choose a CSV file to upload.'], 'title' => 'Import people']);
        }
        $fh = fopen($file['tmp_name'], 'r');
        $first = fgets($fh);
        $first = preg_replace('/^\xEF\xBB\xBF/', '', (string)$first);
        $delim = substr_count($first, ';') > substr_count($first, ',') ? ';' : ',';
        $header = array_map(fn($h) => strtolower(trim((string)$h)), str_getcsv($first, $delim, '"', ''));
        if (!in_array('name', $header, true) || !in_array('email', $header, true)) {
            fclose($fh);
            return view('admin/import', ['results' => null, 'errors' => ['The first row must contain column names, including “name” and “email”.'], 'title' => 'Import people']);
        }

        $results = [];
        $line = 1;
        while (($row = fgetcsv($fh, 0, $delim, '"', '')) !== false) {
            $line++;
            if ($row === [null] || !array_filter($row, fn($v) => trim((string)$v) !== '')) {
                continue;
            }
            $r = [];
            foreach ($header as $i => $h) {
                $r[$h] = trim((string)($row[$i] ?? ''));
            }
            $email = strtolower($r['email'] ?? '');
            $name = $r['name'] ?? '';
            $result = ['line' => $line, 'name' => $name, 'email' => $email, 'status' => '', 'password' => null];

            if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $result['status'] = 'Skipped: missing name or invalid email';
                $results[] = $result;
                continue;
            }
            $teamId = null;
            if (($r['team'] ?? '') !== '') {
                $teamId = DB::val('SELECT id FROM teams WHERE name = ?', [$r['team']]);
                if (!$teamId) {
                    $teamId = DB::insert('teams', ['name' => mb_substr($r['team'], 0, 120), 'campaign' => ($r['campaign'] ?? '') ?: null, 'created_at' => now()]);
                }
            }
            $role = strtolower(str_replace([' ', '-'], '_', $r['role'] ?? ''));
            $role = isset(ROLES[$role]) ? $role : 'agent';

            $existingId = DB::val('SELECT id FROM users WHERE email = ?', [$email]);
            if ($existingId) {
                $upd = ['name' => mb_substr($name, 0, 120), 'role' => $role];
                if ($teamId) {
                    $upd['team_id'] = $teamId;
                }
                if (($r['employee_id'] ?? '') !== '') {
                    $upd['employee_id'] = $r['employee_id'];
                }
                DB::update('users', $upd, 'id = ?', [$existingId]);
                Progress::applyTeamCourses((int)$existingId);
                $result['status'] = 'Updated';
            } else {
                $pw = ($r['password'] ?? '') !== '' && strlen($r['password']) >= 8 ? $r['password'] : random_password();
                $newId = DB::insert('users', [
                    'name' => mb_substr($name, 0, 120), 'email' => $email, 'role' => $role, 'team_id' => $teamId,
                    'employee_id' => ($r['employee_id'] ?? '') ?: null, 'active' => 1,
                    'password_hash' => password_hash($pw, PASSWORD_DEFAULT), 'must_change_password' => 1, 'created_at' => now(),
                ]);
                Progress::applyTeamCourses($newId);
                $result['status'] = 'Created';
                $result['password'] = $pw;
            }
            $results[] = $result;
        }
        fclose($fh);
        return view('admin/import', ['results' => $results, 'errors' => [], 'title' => 'Import people']);
    }

    // ---- teams ------------------------------------------------------------

    public function teams(): string
    {
        $teams = DB::all(
            'SELECT t.*, l.name AS lead_name,
                    (SELECT COUNT(*) FROM users u WHERE u.team_id = t.id AND u.active = 1) AS members,
                    (SELECT COUNT(*) FROM team_courses tc WHERE tc.team_id = t.id) AS courses
             FROM teams t LEFT JOIN users l ON l.id = t.lead_id ORDER BY t.name'
        );
        return view('admin/teams', ['teams' => $teams, 'title' => 'Teams']);
    }

    public function teamForm(?string $id = null): string
    {
        $team = $id ? (DB::one('SELECT * FROM teams WHERE id = ?', [(int)$id]) ?? abort(404)) : ['id' => null, 'name' => '', 'campaign' => '', 'lead_id' => null];
        $leads = DB::all("SELECT id, name, role FROM users WHERE active = 1 AND role IN ('team_lead', 'admin', 'trainer') ORDER BY name");
        $members = $id ? DB::all('SELECT id, name, email, role FROM users WHERE team_id = ? ORDER BY name', [(int)$id]) : [];
        return view('admin/team_form', ['team' => $team, 'leads' => $leads, 'members' => $members, 'errors' => [], 'title' => $id ? 'Edit team' : 'New team']);
    }

    public function teamSave(?string $id = null): string
    {
        $existing = $id ? (DB::one('SELECT * FROM teams WHERE id = ?', [(int)$id]) ?? abort(404)) : null;
        $data = [
            'name' => mb_substr((string)input('name'), 0, 120),
            'campaign' => mb_substr((string)input('campaign'), 0, 120) ?: null,
            'lead_id' => input_int('lead_id') ?: null,
        ];
        if ($data['name'] === '') {
            $leads = DB::all("SELECT id, name, role FROM users WHERE active = 1 AND role IN ('team_lead', 'admin', 'trainer') ORDER BY name");
            return view('admin/team_form', ['team' => array_merge($existing ?? ['id' => null], $data), 'leads' => $leads, 'members' => [], 'errors' => ['Enter a team name.'], 'title' => $existing ? 'Edit team' : 'New team']);
        }
        if ($existing) {
            DB::update('teams', $data, 'id = ?', [$existing['id']]);
        } else {
            DB::insert('teams', $data + ['created_at' => now()]);
        }
        flash('success', 'Team “' . $data['name'] . '” saved.');
        redirect('/admin/teams');
    }

    public function teamDelete(string $id): string
    {
        $team = DB::one('SELECT * FROM teams WHERE id = ?', [(int)$id]) ?? abort(404);
        DB::q('UPDATE users SET team_id = NULL WHERE team_id = ?', [$team['id']]);
        DB::q('DELETE FROM teams WHERE id = ?', [$team['id']]);
        flash('success', 'Team “' . $team['name'] . '” deleted. Its members are now without a team; their courses and progress are kept.');
        redirect('/admin/teams');
    }
}
