<?php
declare(strict_types=1);

/**
 * Front-controller dispatch: matches the request against $routes
 * (from backend/routes.php) and runs the controller. Included by frontend/public/index.php.
 */

/** @var array $routes */
// ---- dispatch -------------------------------------------------------------
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$base = base_url();
if ($base !== '' && str_starts_with($path, $base)) {
    $path = substr($path, strlen($base));
} elseif (str_ends_with($base, '/frontend/public') && str_starts_with($path, substr($base, 0, -16))) {
    // Project folder used as web root (e.g. XAMPP htdocs/shaggar-lms): the root .htaccess forwards to frontend/public/
    $path = substr($path, strlen($base) - 16);
}
if (str_starts_with($path, '/index.php')) {
    $path = substr($path, strlen('/index.php'));
}
$path = '/' . trim($path, '/');

header('X-Frame-Options: SAMEORIGIN');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

try {
    start_session();

    $installed = DB::tableExists('users') && (int)DB::val('SELECT COUNT(*) FROM users') > 0;
    if (!$installed && $path !== '/install') {
        redirect('/install');
    }

    if ($method === 'POST') {
        verify_csrf();
    }

    // Users with a temporary password must set their own first.
    $u = $installed ? user() : null;
    if ($u && (int)$u['must_change_password'] === 1 && !in_array($path, ['/account/password', '/logout'], true)) {
        flash('info', 'Please choose a new password before you continue.');
        redirect('/account/password');
    }

    foreach ($routes as [$m, $pattern, $handler]) {
        if ($m !== $method) {
            continue;
        }
        $regex = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', $pattern) . '$#';
        if (preg_match($regex, $path, $matches)) {
            $params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);
            [$class, $action] = $handler;
            echo (new $class())->$action(...array_values($params));
            exit;
        }
    }
    abort(404, 'We could not find that page.');
} catch (PDOException $e) {
    error_log('[shaggar-lms] ' . $e);
    http_response_code(500);
    $msg = config('debug') ? $e->getMessage() : 'The database is not reachable or not set up. Check backend/config/config.php and that MySQL/MariaDB is running.';
    echo view('error', ['code' => 500, 'title' => 'Database error', 'message' => $msg]);
} catch (Throwable $e) {
    error_log('[shaggar-lms] ' . $e);
    http_response_code(500);
    echo view('error', ['code' => 500, 'title' => 'Something went wrong', 'message' => config('debug') ? $e->getMessage() . ' (' . basename($e->getFile()) . ':' . $e->getLine() . ')' : 'Please try again. If it keeps happening, contact your administrator.']);
}
