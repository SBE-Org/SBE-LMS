<?php
declare(strict_types=1);

/**
 * Thin PDO wrapper. All queries use prepared statements.
 * SQL in this project is written to run on both MySQL/MariaDB and SQLite.
 */
final class DB
{
    private static ?PDO $pdo = null;

    public static function conn(): PDO
    {
        if (self::$pdo) {
            return self::$pdo;
        }
        $c = config('db');
        $opts = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];
        if ($c['driver'] === 'sqlite') {
            $dir = dirname($c['sqlite_path']);
            if (!is_dir($dir)) {
                mkdir($dir, 0775, true);
            }
            $pdo = new PDO('sqlite:' . $c['sqlite_path'], null, null, $opts);
            $pdo->exec('PRAGMA foreign_keys = ON');
            $pdo->exec('PRAGMA journal_mode = WAL');
            $pdo->exec('PRAGMA busy_timeout = 5000');
        } else {
            $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['host'], (int)$c['port'], $c['name']);
            $pdo = new PDO($dsn, $c['user'], $c['pass'], $opts);
            $pdo->exec("SET time_zone = '+03:00'");
        }
        return self::$pdo = $pdo;
    }

    public static function driver(): string
    {
        return config('db')['driver'] === 'sqlite' ? 'sqlite' : 'mysql';
    }

    public static function q(string $sql, array $params = []): PDOStatement
    {
        $st = self::conn()->prepare($sql);
        $st->execute(array_values($params));
        return $st;
    }

    public static function all(string $sql, array $params = []): array
    {
        return self::q($sql, $params)->fetchAll();
    }

    public static function one(string $sql, array $params = []): ?array
    {
        $row = self::q($sql, $params)->fetch();
        return $row === false ? null : $row;
    }

    public static function val(string $sql, array $params = []): mixed
    {
        $v = self::q($sql, $params)->fetchColumn();
        return $v === false ? null : $v;
    }

    /** Column names come from code, never from user input. */
    public static function insert(string $table, array $data, bool $ignore = false): int
    {
        $cols = array_keys($data);
        $verb = $ignore ? (self::driver() === 'sqlite' ? 'INSERT OR IGNORE' : 'INSERT IGNORE') : 'INSERT';
        $sql = sprintf(
            '%s INTO %s (%s) VALUES (%s)',
            $verb,
            $table,
            implode(', ', $cols),
            implode(', ', array_fill(0, count($cols), '?'))
        );
        self::q($sql, array_values($data));
        return (int)self::conn()->lastInsertId();
    }

    public static function update(string $table, array $data, string $where, array $whereParams = []): int
    {
        $sets = implode(', ', array_map(fn($c) => "$c = ?", array_keys($data)));
        return self::q("UPDATE $table SET $sets WHERE $where", [...array_values($data), ...$whereParams])->rowCount();
    }

    public static function tx(callable $fn): mixed
    {
        $pdo = self::conn();
        $pdo->beginTransaction();
        try {
            $r = $fn();
            $pdo->commit();
            return $r;
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    /** Builds "?, ?, ?" for an IN (...) list. Returns "NULL" for an empty list. */
    public static function in(array $values): string
    {
        return $values ? implode(', ', array_fill(0, count($values), '?')) : 'NULL';
    }

    public static function tableExists(string $table): bool
    {
        self::conn(); // connection problems should surface as errors, not as "not installed"
        try {
            self::conn()->query("SELECT 1 FROM $table LIMIT 1");
            return true;
        } catch (PDOException) {
            return false;
        }
    }
}
