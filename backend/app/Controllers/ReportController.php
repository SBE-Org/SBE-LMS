<?php
declare(strict_types=1);

namespace App\Controllers;

use DB;
use Progress;

/**
 * Training reports. Admins and trainers see everyone; team leads see only
 * the teams they lead.
 */
final class ReportController
{
    public function __construct()
    {
        require_role('admin', 'trainer', 'team_lead');
    }

    /** Team filter from the query string, limited to what the viewer may see. */
    private static function teamFilter(): ?array
    {
        $visible = visible_team_ids();
        $team = input_int('team');
        if ($team) {
            if ($visible !== null && !in_array($team, $visible, true)) {
                abort(403, 'You can only view reports for the teams you lead.');
            }
            return [$team];
        }
        return $visible;
    }

    /** Active user ids in scope. null team list = everyone. */
    private static function scopedUserIds(?array $teamIds): array
    {
        if ($teamIds === null) {
            return array_map('intval', array_column(DB::all('SELECT id FROM users WHERE active = 1'), 'id'));
        }
        if (!$teamIds) {
            return [];
        }
        return array_map('intval', array_column(DB::all('SELECT id FROM users WHERE active = 1 AND team_id IN (' . DB::in($teamIds) . ')', $teamIds), 'id'));
    }

    private static function scopedEnrolments(array $userIds, ?int $courseId = null): array
    {
        if (!$userIds) {
            return [];
        }
        $sql = "SELECT e.*, c.title AS course_title, c.status AS course_status, u.name, u.email, u.employee_id, u.team_id, u.last_login_at, t.name AS team_name
                FROM enrolments e
                JOIN courses c ON c.id = e.course_id
                JOIN users u ON u.id = e.user_id
                LEFT JOIN teams t ON t.id = u.team_id
                WHERE e.user_id IN (" . DB::in($userIds) . ')';
        $params = $userIds;
        if ($courseId) {
            $sql .= ' AND e.course_id = ?';
            $params[] = $courseId;
        }
        return DB::all($sql . ' ORDER BY u.name, c.title', $params);
    }

    /** Headline numbers, used by the dashboard and the overview report. */
    public static function summary(?array $teamIds): array
    {
        $userIds = self::scopedUserIds($teamIds);
        $enrolments = self::scopedEnrolments($userIds);
        $progress = Progress::map($userIds);
        $today = today();

        $learners = [];
        $completed = $overdue = 0;
        $scores = [];
        foreach ($enrolments as $e) {
            $learners[(int)$e['user_id']] = true;
            if ($e['completed_at']) {
                $completed++;
            } elseif ($e['due_date'] && $e['due_date'] < $today) {
                $overdue++;
            }
            $s = $progress[(int)$e['user_id']][(int)$e['course_id']]['avg_score'] ?? null;
            if ($s !== null) {
                $scores[] = $s;
            }
        }
        $certs = $userIds ? (int)DB::val('SELECT COUNT(*) FROM certificates WHERE user_id IN (' . DB::in($userIds) . ')', $userIds) : 0;
        $total = count($enrolments);
        return [
            'learners' => count($learners),
            'enrolments' => $total,
            'completed' => $completed,
            'overdue' => $overdue,
            'completion_rate' => $total ? (int)round($completed * 100 / $total) : 0,
            'avg_score' => $scores ? (int)round(array_sum($scores) / count($scores)) : null,
            'certificates' => $certs,
        ];
    }

    public function overview(): string
    {
        $teamIds = self::teamFilter();
        $userIds = self::scopedUserIds($teamIds);
        $enrolments = self::scopedEnrolments($userIds);
        $progress = Progress::map($userIds);
        $today = today();

        $courses = [];
        $teams = [];
        $learners = [];
        foreach ($enrolments as $e) {
            $uid = (int)$e['user_id'];
            $cid = (int)$e['course_id'];
            $p = $progress[$uid][$cid] ?? ['pct' => 0, 'avg_score' => null];
            $isOverdue = !$e['completed_at'] && $e['due_date'] && $e['due_date'] < $today;
            $state = $e['completed_at'] ? 'completed' : ($p['pct'] > 0 ? 'in_progress' : 'not_started');

            $courses[$cid] ??= ['id' => $cid, 'title' => $e['course_title'], 'status' => $e['course_status'], 'enrolled' => 0, 'completed' => 0, 'in_progress' => 0, 'not_started' => 0, 'overdue' => 0, 'scores' => []];
            $courses[$cid]['enrolled']++;
            $courses[$cid][$state]++;
            $courses[$cid]['overdue'] += $isOverdue ? 1 : 0;
            if ($p['avg_score'] !== null) {
                $courses[$cid]['scores'][] = $p['avg_score'];
            }

            $tid = (int)($e['team_id'] ?? 0);
            $teams[$tid] ??= ['id' => $tid, 'name' => $e['team_name'] ?? 'No team', 'people' => [], 'enrolled' => 0, 'completed' => 0, 'overdue' => 0, 'scores' => []];
            $teams[$tid]['people'][$uid] = true;
            $teams[$tid]['enrolled']++;
            $teams[$tid]['completed'] += $e['completed_at'] ? 1 : 0;
            $teams[$tid]['overdue'] += $isOverdue ? 1 : 0;
            if ($p['avg_score'] !== null) {
                $teams[$tid]['scores'][] = $p['avg_score'];
            }

            $learners[$uid] ??= ['id' => $uid, 'name' => $e['name'], 'team' => $e['team_name'], 'last_login_at' => $e['last_login_at'], 'enrolled' => 0, 'completed' => 0, 'overdue' => 0, 'pcts' => [], 'scores' => []];
            $learners[$uid]['enrolled']++;
            $learners[$uid]['completed'] += $e['completed_at'] ? 1 : 0;
            $learners[$uid]['overdue'] += $isOverdue ? 1 : 0;
            $learners[$uid]['pcts'][] = $e['completed_at'] ? 100 : $p['pct'];
            if ($p['avg_score'] !== null) {
                $learners[$uid]['scores'][] = $p['avg_score'];
            }
        }
        $avg = fn(array $a) => $a ? (int)round(array_sum($a) / count($a)) : null;
        foreach ($courses as &$c) {
            $c['rate'] = $c['enrolled'] ? (int)round($c['completed'] * 100 / $c['enrolled']) : 0;
            $c['avg_score'] = $avg($c['scores']);
        }
        foreach ($teams as &$t) {
            $t['people'] = count($t['people']);
            $t['rate'] = $t['enrolled'] ? (int)round($t['completed'] * 100 / $t['enrolled']) : 0;
            $t['avg_score'] = $avg($t['scores']);
        }
        foreach ($learners as &$l) {
            $l['progress'] = $avg($l['pcts']) ?? 0;
            $l['avg_score'] = $avg($l['scores']);
        }
        unset($c, $t, $l);

        usort($courses, fn($a, $b) => strcmp($a['title'], $b['title']));
        usort($teams, fn($a, $b) => strcmp($a['name'], $b['name']));
        usort($learners, fn($a, $b) => [$b['overdue'], $a['progress']] <=> [$a['overdue'], $b['progress']]);

        $visible = visible_team_ids();
        $teamOptions = $visible === null
            ? DB::all('SELECT id, name FROM teams ORDER BY name')
            : ($visible ? DB::all('SELECT id, name FROM teams WHERE id IN (' . DB::in($visible) . ') ORDER BY name', $visible) : []);

        return view('reports/overview', [
            'summary' => self::summary($teamIds),
            'courses' => $courses, 'teams' => $teams, 'learners' => $learners,
            'teamOptions' => $teamOptions, 'team' => input_int('team'),
            'title' => 'Reports',
        ]);
    }

    public function course(string $id): string
    {
        $course = DB::one('SELECT * FROM courses WHERE id = ?', [(int)$id]) ?? abort(404);
        $teamIds = self::teamFilter();
        $userIds = self::scopedUserIds($teamIds);
        $enrolments = self::scopedEnrolments($userIds, (int)$course['id']);
        $ids = array_map(fn($e) => (int)$e['user_id'], $enrolments);
        $progress = Progress::map($ids, [(int)$course['id']]);
        $totals = Progress::courseTotals([(int)$course['id']])[(int)$course['id']] ?? ['lessons' => 0, 'quizzes' => 0, 'total' => 0];

        foreach ($enrolments as &$e) {
            $p = $progress[(int)$e['user_id']][(int)$course['id']] ?? ['pct' => 0, 'lessons_done' => 0, 'quizzes_passed' => 0, 'avg_score' => null];
            $e['p'] = $p;
            $e['overdue'] = !$e['completed_at'] && $e['due_date'] && $e['due_date'] < today();
        }
        unset($e);

        $quizzes = DB::all('SELECT * FROM quizzes WHERE course_id = ? ORDER BY position, id', [$course['id']]);
        foreach ($quizzes as &$q) {
            $q['stats'] = $this->quizStats((int)$q['id'], $ids);
        }
        unset($q);

        $visible = visible_team_ids();
        $teamOptions = $visible === null ? DB::all('SELECT id, name FROM teams ORDER BY name')
            : ($visible ? DB::all('SELECT id, name FROM teams WHERE id IN (' . DB::in($visible) . ') ORDER BY name', $visible) : []);

        return view('reports/course', [
            'course' => $course, 'enrolments' => $enrolments, 'totals' => $totals, 'quizzes' => $quizzes,
            'teamOptions' => $teamOptions, 'team' => input_int('team'), 'title' => 'Report: ' . $course['title'],
        ]);
    }

    private function quizStats(int $quizId, array $userIds): array
    {
        if (!$userIds) {
            return ['attempts' => 0, 'learners' => 0, 'passed' => 0, 'avg' => null, 'pass_rate' => 0];
        }
        $in = DB::in($userIds);
        $row = DB::one(
            "SELECT COUNT(*) AS attempts, COUNT(DISTINCT user_id) AS learners, AVG(percent) AS avg
             FROM quiz_attempts WHERE quiz_id = ? AND status = 'submitted' AND user_id IN ($in)",
            [$quizId, ...$userIds]
        );
        $passed = (int)DB::val(
            "SELECT COUNT(DISTINCT user_id) FROM quiz_attempts WHERE quiz_id = ? AND status = 'submitted' AND passed = 1 AND user_id IN ($in)",
            [$quizId, ...$userIds]
        );
        $learners = (int)$row['learners'];
        return [
            'attempts' => (int)$row['attempts'], 'learners' => $learners, 'passed' => $passed,
            'avg' => $row['avg'] !== null ? (int)round((float)$row['avg']) : null,
            'pass_rate' => $learners ? (int)round($passed * 100 / $learners) : 0,
        ];
    }

    public function quiz(string $id): string
    {
        $quiz = DB::one('SELECT * FROM quizzes WHERE id = ?', [(int)$id]) ?? abort(404);
        $course = DB::one('SELECT * FROM courses WHERE id = ?', [$quiz['course_id']]);
        $userIds = self::scopedUserIds(self::teamFilter());
        $stats = $this->quizStats((int)$quiz['id'], $userIds);

        $questions = [];
        $attempts = [];
        if ($userIds) {
            $in = DB::in($userIds);
            $questions = DB::all(
                "SELECT qu.id, qu.body, qu.type, qu.points,
                        COUNT(aa.id) AS answered,
                        SUM(CASE WHEN aa.correct = 1 THEN 1 ELSE 0 END) AS correct
                 FROM questions qu
                 LEFT JOIN attempt_answers aa ON aa.question_id = qu.id
                      AND aa.attempt_id IN (SELECT a.id FROM quiz_attempts a WHERE a.quiz_id = ? AND a.status = 'submitted' AND a.user_id IN ($in))
                 WHERE qu.quiz_id = ?
                 GROUP BY qu.id, qu.body, qu.type, qu.points, qu.position
                 ORDER BY qu.position, qu.id",
                [$quiz['id'], ...$userIds, $quiz['id']]
            );
            $attempts = DB::all(
                "SELECT a.*, u.name, t.name AS team_name FROM quiz_attempts a
                 JOIN users u ON u.id = a.user_id LEFT JOIN teams t ON t.id = u.team_id
                 WHERE a.quiz_id = ? AND a.status = 'submitted' AND a.user_id IN ($in)
                 ORDER BY a.submitted_at DESC LIMIT 200",
                [$quiz['id'], ...$userIds]
            );
        }
        foreach ($questions as &$q) {
            $q['rate'] = (int)$q['answered'] ? (int)round((int)$q['correct'] * 100 / (int)$q['answered']) : null;
        }
        unset($q);

        return view('reports/quiz', ['quiz' => $quiz, 'course' => $course, 'stats' => $stats, 'questions' => $questions, 'attempts' => $attempts, 'title' => 'Quiz report: ' . $quiz['title']]);
    }

    public function learner(string $id): string
    {
        $person = DB::one('SELECT u.*, t.name AS team_name FROM users u LEFT JOIN teams t ON t.id = u.team_id WHERE u.id = ?', [(int)$id]) ?? abort(404);
        $visible = visible_team_ids();
        if ($visible !== null && !in_array((int)$person['team_id'], $visible, true)) {
            abort(403, 'You can only view people in the teams you lead.');
        }
        $enrolments = DB::all(
            'SELECT e.*, c.title FROM enrolments e JOIN courses c ON c.id = e.course_id WHERE e.user_id = ? ORDER BY c.title',
            [$person['id']]
        );
        $progress = Progress::map([(int)$person['id']])[(int)$person['id']] ?? [];
        $totals = Progress::courseTotals();
        foreach ($enrolments as &$e) {
            $e['p'] = $progress[(int)$e['course_id']] ?? ['pct' => 0, 'done' => 0, 'total' => $totals[(int)$e['course_id']]['total'] ?? 0, 'avg_score' => null];
            $e['overdue'] = !$e['completed_at'] && $e['due_date'] && $e['due_date'] < today();
        }
        unset($e);
        $attempts = DB::all(
            "SELECT a.*, q.title AS quiz_title, c.title AS course_title FROM quiz_attempts a
             JOIN quizzes q ON q.id = a.quiz_id JOIN courses c ON c.id = q.course_id
             WHERE a.user_id = ? AND a.status = 'submitted' ORDER BY a.submitted_at DESC",
            [$person['id']]
        );
        $certificates = DB::all('SELECT ce.*, c.title FROM certificates ce JOIN courses c ON c.id = ce.course_id WHERE ce.user_id = ? ORDER BY ce.issued_at DESC', [$person['id']]);

        return view('reports/learner', ['person' => $person, 'enrolments' => $enrolments, 'attempts' => $attempts, 'certificates' => $certificates, 'title' => $person['name']]);
    }

    public function export(): string
    {
        $teamIds = self::teamFilter();
        $userIds = self::scopedUserIds($teamIds);
        $type = input('type') === 'attempts' ? 'attempts' : 'enrolments';
        $stamp = date('Y-m-d');

        if ($type === 'attempts') {
            $rows = $userIds ? DB::all(
                "SELECT u.name, u.email, u.employee_id, t.name AS team, c.title AS course, q.title AS quiz,
                        a.started_at, a.submitted_at, a.score, a.max_score, a.percent, a.passed
                 FROM quiz_attempts a JOIN users u ON u.id = a.user_id LEFT JOIN teams t ON t.id = u.team_id
                 JOIN quizzes q ON q.id = a.quiz_id JOIN courses c ON c.id = q.course_id
                 WHERE a.status = 'submitted' AND a.user_id IN (" . DB::in($userIds) . ')
                 ORDER BY a.submitted_at DESC',
                $userIds
            ) : [];
            csv_download("quiz-attempts-$stamp.csv",
                ['Name', 'Email', 'Employee ID', 'Team', 'Course', 'Quiz', 'Started', 'Submitted', 'Score', 'Max score', 'Percent', 'Passed'],
                array_map(fn($r) => [$r['name'], $r['email'], $r['employee_id'], $r['team'], $r['course'], $r['quiz'], $r['started_at'], $r['submitted_at'], $r['score'], $r['max_score'], $r['percent'], (int)$r['passed'] ? 'Yes' : 'No'], $rows)
            );
        }

        $enrolments = self::scopedEnrolments($userIds);
        $progress = Progress::map($userIds);
        $today = today();
        $out = [];
        foreach ($enrolments as $e) {
            $p = $progress[(int)$e['user_id']][(int)$e['course_id']] ?? ['pct' => 0, 'avg_score' => null];
            $status = $e['completed_at'] ? 'Completed' : (($e['due_date'] && $e['due_date'] < $today) ? 'Overdue' : ($p['pct'] > 0 ? 'In progress' : 'Not started'));
            $out[] = [$e['name'], $e['email'], $e['employee_id'], $e['team_name'], $e['course_title'], $e['enrolled_at'], $e['due_date'], $e['completed_at'], $e['completed_at'] ? 100 : $p['pct'], $p['avg_score'], $status];
        }
        csv_download("training-progress-$stamp.csv",
            ['Name', 'Email', 'Employee ID', 'Team', 'Course', 'Enrolled', 'Due date', 'Completed', 'Progress %', 'Avg quiz score %', 'Status'],
            $out
        );
    }
}
