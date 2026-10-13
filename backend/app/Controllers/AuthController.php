<?php
declare(strict_types=1);

namespace App\Controllers;

use DB;
use Progress;

final class AuthController
{
    public function loginForm(): string
    {
        if (user()) {
            redirect('/');
        }
        return view('login', ['email' => '', 'error' => null], 'layout_plain');
    }

    public function login(): string
    {
        $email = strtolower((string)input('email'));
        $password = (string)($_POST['password'] ?? '');
        $ip = substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
        $since = date('Y-m-d H:i:s', time() - 15 * 60);

        $fails = (int)DB::val('SELECT COUNT(*) FROM login_attempts WHERE email = ? AND ip = ? AND attempted_at > ?', [$email, $ip, $since]);
        if ($fails >= (int)config('login_max_attempts', 5)) {
            return view('login', ['email' => $email, 'error' => 'Too many failed attempts. Please wait 15 minutes and try again.'], 'layout_plain');
        }

        $u = DB::one('SELECT * FROM users WHERE email = ?', [$email]);
        if (!$u || !password_verify($password, $u['password_hash'])) {
            DB::insert('login_attempts', ['email' => $email, 'ip' => $ip, 'attempted_at' => now()]);
            return view('login', ['email' => $email, 'error' => 'That email and password do not match.'], 'layout_plain');
        }
        if ((int)$u['active'] !== 1) {
            return view('login', ['email' => $email, 'error' => 'Your account is deactivated. Please contact your administrator.'], 'layout_plain');
        }

        DB::q('DELETE FROM login_attempts WHERE email = ?', [$email]);
        if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
            DB::update('users', ['password_hash' => password_hash($password, PASSWORD_DEFAULT)], 'id = ?', [$u['id']]);
        }
        DB::update('users', ['last_login_at' => now()], 'id = ?', [$u['id']]);
        session_regenerate_id(true);
        $_SESSION['user_id'] = (int)$u['id'];
        Progress::applyTeamCourses((int)$u['id']);

        $intended = $_SESSION['intended'] ?? '';
        unset($_SESSION['intended']);
        if ($intended && str_starts_with($intended, '/') && !str_starts_with($intended, '//')) {
            header('Location: ' . $intended);
            exit;
        }
        redirect('/');
    }

    public function logout(): string
    {
        $_SESSION = [];
        session_regenerate_id(true);
        redirect('/login');
    }

    public function passwordForm(): string
    {
        $u = require_login();
        return view('password', ['user' => $u, 'errors' => []]);
    }

    public function password(): string
    {
        $u = require_login();
        $current = (string)($_POST['current'] ?? '');
        $new = (string)($_POST['new'] ?? '');
        $confirm = (string)($_POST['confirm'] ?? '');
        $errors = [];
        if (!password_verify($current, $u['password_hash'])) {
            $errors[] = 'Your current password is not correct.';
        }
        if (strlen($new) < 8) {
            $errors[] = 'The new password must be at least 8 characters.';
        }
        if ($new !== $confirm) {
            $errors[] = 'The two new passwords do not match.';
        }
        if ($new !== '' && $new === $current) {
            $errors[] = 'Choose a password different from the current one.';
        }
        if ($errors) {
            return view('password', ['user' => $u, 'errors' => $errors]);
        }
        DB::update('users', ['password_hash' => password_hash($new, PASSWORD_DEFAULT), 'must_change_password' => 0], 'id = ?', [$u['id']]);
        session_regenerate_id(true);
        flash('success', 'Your password has been changed.');
        redirect('/');
    }
}
