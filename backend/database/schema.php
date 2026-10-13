<?php
declare(strict_types=1);

/**
 * Database schema for MySQL/MariaDB and SQLite.
 * Every statement is "CREATE ... IF NOT EXISTS", so running it again is safe.
 */
function schema_sql(string $driver): array
{
    $mysql = $driver === 'mysql';
    $pk    = $mysql ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    $tail  = $mysql ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : '';
    $text  = $mysql ? 'MEDIUMTEXT' : 'TEXT';

    $tables = [
        "teams" => "
            id $pk,
            name VARCHAR(120) NOT NULL,
            campaign VARCHAR(120) NULL,
            lead_id INT NULL,
            created_at DATETIME NOT NULL",

        "users" => "
            id $pk,
            name VARCHAR(120) NOT NULL,
            email VARCHAR(190) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'agent',
            team_id INT NULL,
            employee_id VARCHAR(50) NULL,
            active TINYINT NOT NULL DEFAULT 1,
            must_change_password TINYINT NOT NULL DEFAULT 0,
            last_login_at DATETIME NULL,
            created_at DATETIME NOT NULL,
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL",

        "login_attempts" => "
            id $pk,
            email VARCHAR(190) NOT NULL,
            ip VARCHAR(45) NOT NULL,
            attempted_at DATETIME NOT NULL",

        "courses" => "
            id $pk,
            title VARCHAR(200) NOT NULL,
            summary TEXT NULL,
            category VARCHAR(80) NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'draft',
            self_enrol TINYINT NOT NULL DEFAULT 0,
            certificate_enabled TINYINT NOT NULL DEFAULT 1,
            created_by INT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL",

        "modules" => "
            id $pk,
            course_id INT NOT NULL,
            title VARCHAR(200) NOT NULL,
            position INT NOT NULL DEFAULT 0,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE",

        "lessons" => "
            id $pk,
            module_id INT NOT NULL,
            title VARCHAR(200) NOT NULL,
            type VARCHAR(20) NOT NULL DEFAULT 'text',
            body $text NULL,
            video_url VARCHAR(500) NULL,
            file_path VARCHAR(255) NULL,
            file_name VARCHAR(255) NULL,
            duration_min INT NULL,
            position INT NOT NULL DEFAULT 0,
            FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE",

        "quizzes" => "
            id $pk,
            course_id INT NOT NULL,
            title VARCHAR(200) NOT NULL,
            description TEXT NULL,
            pass_mark INT NOT NULL DEFAULT 70,
            time_limit_min INT NULL,
            max_attempts INT NOT NULL DEFAULT 0,
            show_answers TINYINT NOT NULL DEFAULT 1,
            shuffle_questions TINYINT NOT NULL DEFAULT 0,
            position INT NOT NULL DEFAULT 0,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE",

        "questions" => "
            id $pk,
            quiz_id INT NOT NULL,
            body TEXT NOT NULL,
            type VARCHAR(20) NOT NULL DEFAULT 'single',
            points INT NOT NULL DEFAULT 1,
            explanation TEXT NULL,
            position INT NOT NULL DEFAULT 0,
            FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE",

        "choices" => "
            id $pk,
            question_id INT NOT NULL,
            body VARCHAR(500) NOT NULL,
            is_correct TINYINT NOT NULL DEFAULT 0,
            position INT NOT NULL DEFAULT 0,
            FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE",

        "enrolments" => "
            id $pk,
            user_id INT NOT NULL,
            course_id INT NOT NULL,
            assigned_by INT NULL,
            due_date DATE NULL,
            enrolled_at DATETIME NOT NULL,
            completed_at DATETIME NULL,
            UNIQUE (user_id, course_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE",

        "team_courses" => "
            id $pk,
            team_id INT NOT NULL,
            course_id INT NOT NULL,
            due_days INT NULL,
            assigned_by INT NULL,
            created_at DATETIME NOT NULL,
            UNIQUE (team_id, course_id),
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE",

        "lesson_progress" => "
            id $pk,
            user_id INT NOT NULL,
            lesson_id INT NOT NULL,
            completed_at DATETIME NOT NULL,
            UNIQUE (user_id, lesson_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE",

        "quiz_attempts" => "
            id $pk,
            user_id INT NOT NULL,
            quiz_id INT NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
            question_order TEXT NULL,
            started_at DATETIME NOT NULL,
            submitted_at DATETIME NULL,
            score INT NOT NULL DEFAULT 0,
            max_score INT NOT NULL DEFAULT 0,
            percent INT NOT NULL DEFAULT 0,
            passed TINYINT NOT NULL DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE",

        "attempt_answers" => "
            id $pk,
            attempt_id INT NOT NULL,
            question_id INT NOT NULL,
            selected VARCHAR(255) NULL,
            correct TINYINT NOT NULL DEFAULT 0,
            points INT NOT NULL DEFAULT 0,
            FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE,
            FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE",

        "certificates" => "
            id $pk,
            user_id INT NOT NULL,
            course_id INT NOT NULL,
            code VARCHAR(40) NOT NULL UNIQUE,
            issued_at DATETIME NOT NULL,
            UNIQUE (user_id, course_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE",
    ];

    $sql = [];
    foreach ($tables as $name => $cols) {
        $sql[] = "CREATE TABLE IF NOT EXISTS $name ($cols\n)$tail";
    }

    $indexes = [
        'idx_users_team' => 'users (team_id)',
        'idx_login_attempts' => 'login_attempts (email, attempted_at)',
        'idx_modules_course' => 'modules (course_id)',
        'idx_lessons_module' => 'lessons (module_id)',
        'idx_quizzes_course' => 'quizzes (course_id)',
        'idx_questions_quiz' => 'questions (quiz_id)',
        'idx_choices_question' => 'choices (question_id)',
        'idx_enrol_course' => 'enrolments (course_id)',
        'idx_attempts_user_quiz' => 'quiz_attempts (user_id, quiz_id)',
        'idx_answers_attempt' => 'attempt_answers (attempt_id)',
    ];
    foreach ($indexes as $idx => $def) {
        // MySQL has no "CREATE INDEX IF NOT EXISTS"; the installer ignores "duplicate key name".
        $sql[] = $mysql ? "CREATE INDEX $idx ON $def" : "CREATE INDEX IF NOT EXISTS $idx ON $def";
    }
    return $sql;
}

function install_schema(): void
{
    $pdo = DB::conn();
    foreach (schema_sql(DB::driver()) as $stmt) {
        try {
            $pdo->exec($stmt);
        } catch (PDOException $e) {
            // 1061 = duplicate index name (MySQL): index already exists, fine.
            if (!str_contains($e->getMessage(), '1061') && !str_contains(strtolower($e->getMessage()), 'duplicate key name')) {
                throw $e;
            }
        }
    }
}
