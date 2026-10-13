<?php
declare(strict_types=1);

define('ROOT', dirname(__DIR__, 2));          // project root
define('BACKEND', ROOT . '/backend');        // PHP application, config, database, storage
define('FRONTEND', ROOT . '/frontend');      // templates and the public web root

// ---- configuration --------------------------------------------------------
$configFile = BACKEND . '/config/config.php';
$config = require (is_file($configFile) ? $configFile : BACKEND . '/config/config.example.php');

$envMap = [
    'APP_NAME' => ['app_name'], 'APP_COMPANY' => ['company'], 'APP_BASE_URL' => ['base_url'],
    'APP_TIMEZONE' => ['timezone'], 'APP_DEBUG' => ['debug'],
    'DB_DRIVER' => ['db', 'driver'], 'DB_HOST' => ['db', 'host'], 'DB_PORT' => ['db', 'port'],
    'DB_NAME' => ['db', 'name'], 'DB_USER' => ['db', 'user'], 'DB_PASS' => ['db', 'pass'],
    'DB_SQLITE_PATH' => ['db', 'sqlite_path'], 'UPLOADS_DIR' => ['uploads_dir'],
    'MAX_UPLOAD_MB' => ['max_upload_mb'],
];
foreach ($envMap as $env => $path) {
    $v = getenv($env);
    if ($v === false || $v === '') {
        continue;
    }
    if ($env === 'APP_DEBUG') {
        $v = in_array(strtolower($v), ['1', 'true', 'yes', 'on'], true);
    }
    if (count($path) === 1) {
        $config[$path[0]] = $v;
    } else {
        $config[$path[0]][$path[1]] = $v;
    }
}
$GLOBALS['config'] = $config;

date_default_timezone_set($config['timezone'] ?: 'Africa/Addis_Ababa');
error_reporting(E_ALL);
ini_set('display_errors', $config['debug'] ? '1' : '0');
mb_internal_encoding('UTF-8');

require BACKEND . '/app/DB.php';
require BACKEND . '/app/helpers.php';
require BACKEND . '/app/Progress.php';
require BACKEND . '/database/schema.php';

spl_autoload_register(function (string $class): void {
    $prefix = 'App\\Controllers\\';
    if (str_starts_with($class, $prefix)) {
        $file = BACKEND . '/app/Controllers/' . substr($class, strlen($prefix)) . '.php';
        if (is_file($file)) {
            require $file;
        }
    }
});
