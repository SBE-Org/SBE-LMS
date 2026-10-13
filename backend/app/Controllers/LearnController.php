<?php
declare(strict_types=1);

namespace App\Controllers;

use DB;
use Progress;

final class LearnController
{
    /** Loads a course the current user may view, or stops with 403/404. */
    public static function viewableCourse(int $courseId): array
    {
        $u = require_login();
        $course = DB::one('SELECT * FROM courses WHERE id = ?', [$courseId]);
        if (!$course) {
            abort(404, 'This course does not exist.');
        }
        if (is_staff()) {
            return $course;
        }
        if ($course['status'] !== 'published') {
            abort(404, 'This course is not available.');
        }
        if (!Progress::isEnrolled($u['id'], $courseId) && (int)$course['self_enrol'] !== 1) {
            abort(403, 'You are not enrolled in this course. Ask your trainer or team lead to assign it to you.');
        }
        return $course;
    }

    public function catalog(): string
    {
        $u = require_login();
        $q = (string)input('q');
        $cat = (string)input('category');

        $where = ["c.status = 'published'"];
        $params = [$u['id']];
        if ($q !== '') {
            $where[] = '(c.title LIKE ? OR c.summary LIKE ?)';
            $params[] = "%$q%";
            $params[] = "%$q%";
        }
        if ($cat !== '') {
            $where[] = 'c.category = ?';
            $params[] = $cat;
        }
        $courses = DB::all(
            'SELECT c.*, e.id AS enrolment_id, e.completed_at, e.due_date
             FROM courses c
             LEFT JOIN enrolments e ON e.course_id = c.id AND e.user_id = ?
             WHERE ' . implode(' AND ', $where) . '
             ORDER BY c.title',
            $params
        );
        // Learners only see courses they are in, plus courses open to everyone.
        $courses = array_values(array_filter($courses, fn($c) => $c['enrolment_id'] || (int)$c['self_enrol'] === 1));

        $ids = array_map(fn($c) => (int)$c['id'], $courses);
        $progress = Progress::map([$u['id']], $ids ?: [0])[$u['id']] ?? [];
        $totals = Progress::courseTotals($ids ?: [0]);
        foreach ($courses as &$c) {
            $c['pct'] = $progress[(int)$c['id']]['pct'] ?? 0;
            $c['items'] = $totals[(int)$c['id']]['total'] ?? 0;
        }
        unset($c);

        $categories = array_column(DB::all("SELECT DISTINCT category FROM courses WHERE status = 'published' AND category IS NOT NULL AND category <> '' ORDER BY category"), 'category');

        return view('catalog', ['courses' => $courses, 'q' => $q, 'category' => $cat, 'categories' => $categories, 'title' => 'Courses']);
    }

    public function course(string $id): string
    {
        $u = require_login();
        $course = self::viewableCourse((int)$id);
        $enrolment = DB::one('SELECT * FROM enrolments WHERE user_id = ? AND course_id = ?', [$u['id'], $course['id']]);
        $outline = Progress::outline((int)$course['id'], $u['id']);
        $progress = Progress::forUser($u['id'], (int)$course['id']);
        $certificate = DB::one('SELECT * FROM certificates WHERE user_id = ? AND course_id = ?', [$u['id'], $course['id']]);

        return view('course', [
            'course' => $course,
            'enrolment' => $enrolment,
            'outline' => $outline,
            'progress' => $progress,
            'certificate' => $certificate,
            'title' => $course['title'],
        ]);
    }

    public function selfEnrol(string $id): string
    {
        $u = require_login();
        $course = DB::one("SELECT * FROM courses WHERE id = ? AND status = 'published'", [(int)$id]);
        if (!$course || (int)$course['self_enrol'] !== 1) {
            abort(403, 'This course is not open for self-enrolment.');
        }
        Progress::enrol($u['id'], (int)$course['id']);
        flash('success', 'You are now enrolled in “' . $course['title'] . '”.');
        redirect('/courses/' . $course['id']);
    }

    private function loadLesson(int $id): array
    {
        $lesson = DB::one(
            'SELECT l.*, m.course_id, m.title AS module_title FROM lessons l JOIN modules m ON m.id = l.module_id WHERE l.id = ?',
            [$id]
        );
        if (!$lesson) {
            abort(404, 'This lesson does not exist.');
        }
        return $lesson;
    }

    public function lesson(string $id): string
    {
        $u = require_login();
        $lesson = $this->loadLesson((int)$id);
        $course = self::viewableCourse((int)$lesson['course_id']);
        $enrolled = Progress::isEnrolled($u['id'], (int)$course['id']);
        if (!$enrolled && !is_staff()) {
            flash('info', 'Join the course to start learning.');
            redirect('/courses/' . $course['id']);
        }

        $outline = Progress::outline((int)$course['id'], $u['id']);
        $flat = $outline['lessons'];
        $prev = $next = null;
        foreach ($flat as $i => $l) {
            if ((int)$l['id'] === (int)$lesson['id']) {
                $prev = $flat[$i - 1] ?? null;
                $next = $flat[$i + 1] ?? null;
                break;
            }
        }
        $done = (bool)DB::val('SELECT 1 FROM lesson_progress WHERE user_id = ? AND lesson_id = ?', [$u['id'], $lesson['id']]);
        $progress = Progress::forUser($u['id'], (int)$course['id']);

        return view('lesson', [
            'lesson' => $lesson,
            'course' => $course,
            'outline' => $outline,
            'prev' => $prev,
            'next' => $next,
            'done' => $done,
            'enrolled' => $enrolled,
            'progress' => $progress,
            'title' => $lesson['title'],
        ]);
    }

    public function complete(string $id): string
    {
        $u = require_login();
        $lesson = $this->loadLesson((int)$id);
        self::viewableCourse((int)$lesson['course_id']);
        if (!Progress::isEnrolled($u['id'], (int)$lesson['course_id'])) {
            abort(403, 'You need to be enrolled in this course to record progress.');
        }
        DB::insert('lesson_progress', ['user_id' => $u['id'], 'lesson_id' => $lesson['id'], 'completed_at' => now()], true);
        $finished = Progress::checkCompletion($u['id'], (int)$lesson['course_id']);

        if ($finished) {
            flash('success', 'Congratulations — you have completed this course!');
            redirect('/courses/' . $lesson['course_id']);
        }
        $next = input('next');
        if ($next !== '' && ctype_digit((string)$next)) {
            redirect('/lessons/' . $next);
        }
        $o = Progress::outline((int)$lesson['course_id'], $u['id']);
        if ($o['next']) {
            redirect(($o['next']['type'] === 'quiz' ? '/quizzes/' : '/lessons/') . $o['next']['id']);
        }
        redirect('/courses/' . $lesson['course_id']);
    }

    public function file(string $id): string
    {
        $u = require_login();
        $lesson = $this->loadLesson((int)$id);
        self::viewableCourse((int)$lesson['course_id']);
        if (!is_staff() && !Progress::isEnrolled($u['id'], (int)$lesson['course_id'])) {
            abort(403);
        }
        if (!$lesson['file_path'] || !preg_match('/^[a-f0-9]{32}\.[a-z0-9]+$/', $lesson['file_path'])) {
            abort(404, 'This lesson has no file.');
        }
        send_file(config('uploads_dir') . '/' . $lesson['file_path'], $lesson['file_name'] ?: $lesson['file_path'], input('download') !== '1');
    }
}
