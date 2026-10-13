<?php
declare(strict_types=1);

/**
 * Command-line installer.
 *
 *   php bin/install.php --admin-email=admin@shaggar.com --admin-password=Secret123 [--admin-name="System Admin"] [--demo]
 *
 * Creates (or updates) the database tables. If there are no users yet, it also
 * creates the administrator and, with --demo, loads sample teams, people and courses.
 */
if (PHP_SAPI !== 'cli') {
    exit("Run this from the command line.\n");
}
require dirname(__DIR__) . '/app/bootstrap.php';
require BACKEND . '/database/seed.php';

$opts = getopt('', ['admin-email:', 'admin-password:', 'admin-name::', 'demo']);

echo 'Database driver: ' . DB::driver() . PHP_EOL;
install_schema();
echo "Tables are ready.\n";

if ((int)DB::val('SELECT COUNT(*) FROM users') > 0) {
    echo "Users already exist, so no administrator or demo data was added.\n";
    exit(0);
}
$email = strtolower((string)($opts['admin-email'] ?? ''));
$password = (string)($opts['admin-password'] ?? '');
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 8) {
    fwrite(STDERR, "Give --admin-email and an --admin-password of at least 8 characters to create the first administrator.\n");
    exit(1);
}
$adminId = create_admin((string)($opts['admin-name'] ?? 'Administrator'), $email, $password);
echo "Administrator created: $email\n";

if (isset($opts['demo'])) {
    seed_demo($adminId);
    echo "Demo data loaded. Demo accounts use the password Welcome@123 (e.g. trainer@shaggar.test, hana.tesfaye@shaggar.test, abebe.kebede@shaggar.test).\n";
}
echo "Done.\n";
