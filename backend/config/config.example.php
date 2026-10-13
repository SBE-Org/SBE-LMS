<?php
/**
 * Shaggar BPO Academy - configuration
 *
 * Copy this file to backend/config/config.php and edit it. Every value can also be
 * set with an environment variable (shown on the right), which is how the
 * Docker setup configures the app.
 */
return [
    'app_name'  => 'Shaggar BPO Academy',          // APP_NAME
    'company'   => 'Shaggar BPO Enterprise',        // APP_COMPANY

    // Leave empty to detect automatically. Set it if the app sits in a
    // sub-folder, e.g. '/shaggar-lms/public' on XAMPP.            APP_BASE_URL
    'base_url'  => '',

    'timezone'  => 'Africa/Addis_Ababa',            // APP_TIMEZONE
    'debug'     => false,                           // APP_DEBUG (true shows errors)

    'db' => [
        // 'mysql' for MySQL / MariaDB (recommended for production)
        // 'sqlite' for a quick trial with no database server
        'driver'      => 'mysql',                    // DB_DRIVER
        'host'        => '127.0.0.1',                // DB_HOST
        'port'        => 3306,                       // DB_PORT
        'name'        => 'shaggar_lms',              // DB_NAME
        'user'        => 'root',                     // DB_USER
        'pass'        => '',                         // DB_PASS
        'sqlite_path' => __DIR__ . '/../storage/database.sqlite', // DB_SQLITE_PATH
    ],

    // Lesson files (PDF, video, slides) are stored here, outside the web root.
    'uploads_dir'   => __DIR__ . '/../storage/uploads', // UPLOADS_DIR
    'max_upload_mb' => 200,                              // MAX_UPLOAD_MB

    // Failed logins allowed per email + IP within 15 minutes.
    'login_max_attempts' => 5,
];
