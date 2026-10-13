<?php
declare(strict_types=1);

/**
 * Learning progress, enrolment and certification rules.
 *
 * A course is complete when the learner has finished every lesson and passed
 * every quiz in it. Completion then issues a certificate (if the course has
 * certificates switched on).
 */
final class Progress
{
    /** Number of lessons and quizzes per course: [course_id => ['lessons'=>n, 'quizzes'=>n, 'total'=>n]] */
    public static function courseTotals(?array $courseIds = null): array
    {
        $where = $courseIds === null ? '' : ' WHERE c.id IN (' . DB::in($courseIds) . ')';
        $params = $courseIds ?? [];
        $rows = DB::all(
            "SELECT c.id,
                    (SELECT COUNT(*) FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = c.id) AS lessons,
                    (SELECT COUNT(*) FROM quizzes q WHERE q.course_id = c.id) AS quizzes
             FROM courses c$where",
            $params
        );
        $out = [];
        foreach ($rows as $r) {
            $out[(int)$r['id']] = ['lessons' => (int)$r['lessons'], 'quizzes' => (int)$r['quizzes'], 'total' => (int)$r['lessons'] + (int)$r['quizzes']];
        }
        return $out;
    }

    /**
     * Progress for many learners at once.
     * Returns [user_id][course_id] => ['lessons_done', 'quizzes_passed', 'done', 'total', 'pct', 'avg_score']
     */
    public static function map(array $userIds, ?array $courseIds = null): array
    {
        if (!$userIds) {
            return [];
        }
        $totals = self::courseTotals($courseIds);
        $uIn = DB::in($userIds);

        $lessonRows = DB::all(
            "SELECT lp.user_id, m.course_id, COUNT(*) AS n
             FROM lesson_progress lp
             JOIN lessons l ON l.id = lp.lesson_id
             JOIN modules m ON m.id = l.module_id
             WHERE lp.user_id IN ($uIn)
             GROUP BY lp.user_id, m.course_id",
            $userIds
        );
        $quizRows = DB::all(
            "SELECT a.user_id, q.course_id,
                    COUNT(DISTINCT CASE WHEN a.passed = 1 THEN a.quiz_id END) AS passed,
                    MAX(a.percent) AS best
             FROM quiz_attempts a
             JOIN quizzes q ON q.id = a.quiz_id
             WHERE a.user_id IN ($uIn) AND a.status = 'submitted'
             GROUP BY a.user_id, q.course_id",
            $userIds
        );
        // Average of each learner's best score per quiz, per course
        $bestRows = DB::all(
            "SELECT a.user_id, q.course_id, a.quiz_id, MAX(a.percent) AS best
             FROM quiz_attempts a
             JOIN quizzes q ON q.id = a.quiz_id
             WHERE a.user_id IN ($uIn) AND a.status = 'submitted'
             GROUP BY a.user_id, q.course_id, a.quiz_id",
            $userIds
        );

        $out = [];
        $ensure = function (int $u, int $c) use (&$out, $totals) {
            if (!isset($out[$u][$c])) {
                $out[$u][$c] = ['lessons_done' => 0, 'quizzes_passed' => 0, 'done' => 0, 'total' => $totals[$c]['total'] ?? 0, 'pct' => 0, 'avg_score' => null, '_scores' => []];
            }
        };
        foreach ($lessonRows as $r) {
            $ensure((int)$r['user_id'], (int)$r['course_id']);
            $out[(int)$r['user_id']][(int)$r['course_id']]['lessons_done'] = (int)$r['n'];
        }
        foreach ($quizRows as $r) {
            $ensure((int)$r['user_id'], (int)$r['course_id']);
            $out[(int)$r['user_id']][(int)$r['course_id']]['quizzes_passed'] = (int)$r['passed'];
        }
        foreach ($bestRows as $r) {
            $ensure((int)$r['user_id'], (int)$r['course_id']);
            $out[(int)$r['user_id']][(int)$r['course_id']]['_scores'][] = (int)$r['best'];
        }
        foreach ($out as $u => $courses) {
            foreach ($courses as $c => $p) {
                $p['done'] = $p['lessons_done'] + $p['quizzes_passed'];
                $p['pct'] = $p['total'] > 0 ? (int)floor(min(100, $p['done'] * 100 / $p['total'])) : 0;
                $p['avg_score'] = $p['_scores'] ? (int)round(array_sum($p['_scores']) / count($p['_scores'])) : null;
                unset($p['_scores']);
                $out[$u][$c] = $p;
            }
        }
        return $out;
    }

    public static function forUser(int $userId, int $courseId): array
    {
        $m = self::map([$userId], [$courseId]);
        $t = self::courseTotals([$courseId]);
        return $m[$userId][$courseId] ?? ['lessons_done' => 0, 'quizzes_passed' => 0, 'done' => 0, 'total' => $t[$courseId]['total'] ?? 0, 'pct' => 0, 'avg_score' => null];
    }

    /** Marks the enrolment complete and issues a certificate when everything is done. */
    public static function checkCompletion(int $userId, int $courseId): bool
    {
        $enrol = DB::one('SELECT * FROM enrolments WHERE user_id = ? AND course_id = ?', [$userId, $courseId]);
        if (!$enrol) {
            return false;
        }
        $p = self::forUser($userId, $courseId);
        $quizCount = (int)DB::val('SELECT COUNT(*) FROM quizzes WHERE course_id = ?', [$courseId]);
        $lessonCount = $p['total'] - $quizCount;
        $complete = $p['total'] > 0 && $p['lessons_done'] >= $lessonCount && $p['quizzes_passed'] >= $quizCount;

        if ($complete && !$enrol['completed_at']) {
            DB::update('enrolments', ['completed_at' => now()], 'id = ?', [$enrol['id']]);
            $course = DB::one('SELECT certificate_enabled FROM courses WHERE id = ?', [$courseId]);
            if ($course && (int)$course['certificate_enabled'] === 1) {
                self::issueCertificate($userId, $courseId);
            }
            return true;
        }
        return $complete;
    }

    public static function issueCertificate(int $userId, int $courseId): string
    {
        $existing = DB::val('SELECT code FROM certificates WHERE user_id = ? AND course_id = ?', [$userId, $courseId]);
        if ($existing) {
            return (string)$existing;
        }
        $code = 'SHG-' . date('Y') . '-' . strtoupper(substr(bin2hex(random_bytes(6)), 0, 10));
        DB::insert('certificates', ['user_id' => $userId, 'course_id' => $courseId, 'code' => $code, 'issued_at' => now()], true);
        return (string)DB::val('SELECT code FROM certificates WHERE user_id = ? AND course_id = ?', [$userId, $courseId]);
    }

    /** Enrols a user if not already enrolled. Returns true if a new enrolment was created. */
    public static function enrol(int $userId, int $courseId, ?int $assignedBy = null, ?string $dueDate = null): bool
    {
        $exists = DB::val('SELECT id FROM enrolments WHERE user_id = ? AND course_id = ?', [$userId, $courseId]);
        if ($exists) {
            if ($dueDate) {
                DB::update('enrolments', ['due_date' => $dueDate], 'id = ?', [$exists]);
            }
            return false;
        }
        DB::insert('enrolments', [
            'user_id' => $userId, 'course_id' => $courseId, 'assigned_by' => $assignedBy,
            'due_date' => $dueDate ?: null, 'enrolled_at' => now(),
        ], true);
        // Work already done (e.g. after re-enrolment) still counts
        self::checkCompletion($userId, $courseId);
        return true;
    }

    /** Enrols a user in every course assigned to their team. */
    public static function applyTeamCourses(int $userId): int
    {
        $teamId = DB::val('SELECT team_id FROM users WHERE id = ?', [$userId]);
        if (!$teamId) {
            return 0;
        }
        $n = 0;
        foreach (DB::all('SELECT * FROM team_courses WHERE team_id = ?', [$teamId]) as $tc) {
            if (self::isEnrolled($userId, (int)$tc['course_id'])) {
                continue;
            }
            $due = $tc['due_days'] ? date('Y-m-d', strtotime('+' . (int)$tc['due_days'] . ' days')) : null;
            $n += self::enrol($userId, (int)$tc['course_id'], $tc['assigned_by'] ? (int)$tc['assigned_by'] : null, $due) ? 1 : 0;
        }
        return $n;
    }

    /**
     * Course structure with the learner's status on every item, plus the next item to do.
     * ['modules' => [...modules with 'lessons'], 'quizzes' => [...], 'next' => ['type','id','title'] | null]
     */
    public static function outline(int $courseId, int $userId): array
    {
        $modules = DB::all('SELECT * FROM modules WHERE course_id = ? ORDER BY position, id', [$courseId]);
        $lessons = DB::all(
            'SELECT l.id, l.module_id, l.title, l.type, l.duration_min, l.file_name, lp.completed_at
             FROM lessons l
             JOIN modules m ON m.id = l.module_id
             LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = ?
             WHERE m.course_id = ?
             ORDER BY m.position, m.id, l.position, l.id',
            [$userId, $courseId]
        );
        $byModule = [];
        foreach ($lessons as $l) {
            $byModule[(int)$l['module_id']][] = $l;
        }
        foreach ($modules as &$m) {
            $m['lessons'] = $byModule[(int)$m['id']] ?? [];
        }
        unset($m);

        $quizzes = DB::all(
            "SELECT q.*,
                    (SELECT COUNT(*) FROM questions qu WHERE qu.quiz_id = q.id) AS question_count,
                    (SELECT MAX(a.percent) FROM quiz_attempts a WHERE a.quiz_id = q.id AND a.user_id = ? AND a.status = 'submitted') AS best,
                    (SELECT MAX(a.passed) FROM quiz_attempts a WHERE a.quiz_id = q.id AND a.user_id = ? AND a.status = 'submitted') AS passed,
                    (SELECT COUNT(*) FROM quiz_attempts a WHERE a.quiz_id = q.id AND a.user_id = ? AND a.status = 'submitted') AS attempts
             FROM quizzes q WHERE q.course_id = ? ORDER BY q.position, q.id",
            [$userId, $userId, $userId, $courseId]
        );

        $next = null;
        foreach ($lessons as $l) {
            if (!$l['completed_at']) {
                $next = ['type' => 'lesson', 'id' => (int)$l['id'], 'title' => $l['title']];
                break;
            }
        }
        if (!$next) {
            foreach ($quizzes as $q) {
                if ((int)$q['passed'] !== 1) {
                    $next = ['type' => 'quiz', 'id' => (int)$q['id'], 'title' => $q['title']];
                    break;
                }
            }
        }
        return ['modules' => $modules, 'quizzes' => $quizzes, 'lessons' => $lessons, 'next' => $next];
    }

    public static function isEnrolled(int $userId, int $courseId): bool
    {
        return (bool)DB::val('SELECT 1 FROM enrolments WHERE user_id = ? AND course_id = ?', [$userId, $courseId]);
    }
}
