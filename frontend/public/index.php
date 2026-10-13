<?php
declare(strict_types=1);

// Web entry point. All application code lives in ../../backend.
require dirname(__DIR__, 2) . '/backend/app/bootstrap.php';

// When run with PHP's built-in server, let it serve real files (CSS, JS, images).
if (PHP_SAPI === 'cli-server') {
    $f = __DIR__ . parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    if ($f !== __FILE__ && is_file($f)) {
        return false;
    }
}

$routes = require BACKEND . '/routes.php';
require BACKEND . '/app/dispatch.php';
