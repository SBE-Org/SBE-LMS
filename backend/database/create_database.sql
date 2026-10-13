-- Run once in MySQL / MariaDB (phpMyAdmin → SQL tab, or the mysql command line)
-- before opening the installer. Change the password.
CREATE DATABASE IF NOT EXISTS shaggar_lms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'shaggar'@'localhost' IDENTIFIED BY 'change-this-password';
GRANT ALL PRIVILEGES ON shaggar_lms.* TO 'shaggar'@'localhost';
FLUSH PRIVILEGES;
