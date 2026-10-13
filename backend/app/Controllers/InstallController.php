<?php
declare(strict_types=1);

namespace App\Controllers;

use DB;

/** First-run setup: creates the tables and the first administrator. */
final class InstallController
{
    private function guard(): void
    {
        if (DB::tableExists('users') && (int)DB::val('SELECT COUNT(*) FROM users') > 0) {
            abort(404, 'The platform is already installed.');
        }
    }

    public function form(): string
    {
        $this->guard();
        return view('install', ['errors' => [], 'old' => [], 'driver' => DB::driver()], 'layout_plain');
    }

    public function run(): string
    {
        $this->guard();
        $old = ['name' => input('name'), 'email' => strtolower((string)input('email'))];
        $password = (string)($_POST['password'] ?? '');
        $errors = [];
        if ($old['name'] === '') {
            $errors[] = 'Enter the administrator name.';
        }
        if (!filter_var($old['email'], FILTER_VALIDATE_EMAIL)) {
            $errors[] = 'Enter a valid email address.';
        }
        if (strlen($password) < 8) {
            $errors[] = 'The password must be at least 8 characters.';
        }
        if ($errors) {
            return view('install', ['errors' => $errors, 'old' => $old, 'driver' => DB::driver()], 'layout_plain');
        }

        install_schema();
        require_once BACKEND . '/database/seed.php';
        $adminId = create_admin($old['name'], $old['email'], $password);
        if (checked('demo')) {
            seed_demo($adminId);
        }
        session_regenerate_id(true);
        $_SESSION['user_id'] = $adminId;
        flash('success', 'Installation complete. Welcome to ' . config('app_name') . '!');
        redirect('/');
    }
}
