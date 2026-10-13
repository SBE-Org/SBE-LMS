<?php
declare(strict_types=1);

namespace App\Controllers;

use DB;
use Progress;
use RuntimeException;

/** Course authoring and enrolment, for administrators and trainers. */
final class ManageController
{
    public function __construct()
    {
        require_role('admin', 'trainer');
    }

    private function course(int $id): array
    {
        $c = DB::one('SELECT * FROM courses WHERE id = ?', [$id]);
        if (!$c) {
            abort(404, 'This course does not exist.');
        }
        return $c;
    }

    private function module(int $id): array
    {
        $m = DB::one('SELECT * FROM modules WHERE id = ?', [$id]);
        if (!$m) {
            abort(404, 'This module does not exist.');
        }
        return $m;
    }

    private function touch(int $courseId): void
    {
        DB::update('courses', ['updated_at' => now()], 'id = ?', [$courseId]);
    }

    // ---- courses ----------------------------------------------------------

    public function courses(): string
    {
        $status = (string)input('status');
        $params = [];
        $where = '';
        if (in_array($status, ['draft', 'published', 'archived'], true)) {
            $where = 'WHERE c.status = ?';
            $params[] = $status;
        }
        $courses = DB::all(
            "SELECT c.*, u.name AS author,
                    (SELECT COUNT(*) FROM modules m WHERE m.course_id = c.id) AS module_count,
                    (SELECT COUNT(*) FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = c.id) AS lesson_count,
                    (SELECT COUNT(*) FROM quizzes q WHERE q.course_id = c.id) AS quiz_count,
                    (SELECT COUNT(*) FROM enrolments e WHERE e.course_id = c.id) AS enrolled,
                    (SELECT COUNT(*) FROM enrolments e WHERE e.course_id = c.id AND e.completed_at IS NOT NULL) AS completed
             FROM courses c LEFT JOIN users u ON u.id = c.created_by
             $where
             ORDER BY c.updated_at DESC",
            $params
        );
        return view('manage/courses', ['courses' => $courses, 'status' => $status, 'title' => 'Manage courses']);
    }

    public function courseForm(?string $id = null): string
    {
        $course = $id ? $this->course((int)$id) : ['id' => null, 'title' => '', 'summary' => '', 'category' => '', 'status' => 'draft', 'self_enrol' => 0, 'certificate_enabled' => 1];
        $categories = array_column(DB::all("SELECT DISTINCT category FROM courses WHERE category IS NOT NULL AND category <> '' ORDER BY category"), 'category');
        return view('manage/course_form', ['course' => $course, 'errors' => [], 'categories' => $categories, 'title' => $id ? 'Edit course' : 'New course']);
    }

    public function courseSave(?string $id = null): string
    {
        $existing = $id ? $this->course((int)$id) : null;
        $data = [
            'title' => mb_substr((string)input('title'), 0, 200),
            'summary' => (string)input('summary'),
            'category' => mb_substr((string)input('category'), 0, 80) ?: null,
            'status' => in_array(input('status'), ['draft', 'published', 'archived'], true) ? input('status') : 'draft',
            'self_enrol' => checked('self_enrol'),
            'certificate_enabled' => checked('certificate_enabled'),
            'updated_at' => now(),
        ];
        if ($data['title'] === '') {
            $categories = array_column(DB::all("SELECT DISTINCT category FROM courses WHERE category IS NOT NULL AND category <> '' ORDER BY category"), 'category');
            return view('manage/course_form', ['course' => array_merge($existing ?? ['id' => null], $data), 'errors' => ['Enter a course title.'], 'categories' => $categories, 'title' => $id ? 'Edit course' : 'New course']);
        }
        if ($existing) {
            DB::update('courses', $data, 'id = ?', [$existing['id']]);
            flash('success', 'Course saved.');
            redirect('/manage/courses/' . $existing['id']);
        }
        $newId = DB::insert('courses', $data + ['created_by' => uid(), 'created_at' => now()]);
        DB::insert('modules', ['course_id' => $newId, 'title' => 'Module 1', 'position' => 1]);
        flash('success', 'Course created. Now add lessons and a quiz.');
        redirect('/manage/courses/' . $newId);
    }

    public function courseDelete(string $id): string
    {
        $course = $this->course((int)$id);
        if (input('confirm_title') !== $course['title']) {
            flash('error', 'To delete, type the exact course title. Nothing was deleted.');
            redirect('/manage/courses/' . $course['id'] . '/edit');
        }
        $files = DB::all('SELECT l.file_path FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = ?', [$course['id']]);
        DB::q('DELETE FROM courses WHERE id = ?', [$course['id']]);
        foreach ($files as $f) {
            delete_upload($f['file_path']);
        }
        flash('success', 'Course “' . $course['title'] . '” was deleted.');
        redirect('/manage/courses');
    }

    public function builder(string $id): string
    {
        $course = $this->course((int)$id);
        $modules = DB::all('SELECT * FROM modules WHERE course_id = ? ORDER BY position, id', [$course['id']]);
        $lessons = DB::all(
            'SELECT l.* FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = ? ORDER BY l.position, l.id',
            [$course['id']]
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
            'SELECT q.*, (SELECT COUNT(*) FROM questions x WHERE x.quiz_id = q.id) AS question_count,
                    (SELECT COALESCE(SUM(x.points), 0) FROM questions x WHERE x.quiz_id = q.id) AS total_points
             FROM quizzes q WHERE q.course_id = ? ORDER BY q.position, q.id',
            [$course['id']]
        );
        $enrolled = (int)DB::val('SELECT COUNT(*) FROM enrolments WHERE course_id = ?', [$course['id']]);
        return view('manage/builder', ['course' => $course, 'modules' => $modules, 'quizzes' => $quizzes, 'enrolled' => $enrolled, 'title' => $course['title']]);
    }

    // ---- modules ----------------------------------------------------------

    public function moduleAdd(string $id): string
    {
        $course = $this->course((int)$id);
        $title = mb_substr((string)input('title'), 0, 200);
        if ($title === '') {
            flash('error', 'Enter a module title.');
            redirect('/manage/courses/' . $course['id']);
        }
        $pos = (int)DB::val('SELECT COALESCE(MAX(position), 0) FROM modules WHERE course_id = ?', [$course['id']]) + 1;
        DB::insert('modules', ['course_id' => $course['id'], 'title' => $title, 'position' => $pos]);
        $this->touch((int)$course['id']);
        flash('success', 'Module added.');
        redirect('/manage/courses/' . $course['id']);
    }

    public function moduleRename(string $id): string
    {
        $m = $this->module((int)$id);
        $title = mb_substr((string)input('title'), 0, 200);
        if ($title !== '') {
            DB::update('modules', ['title' => $title], 'id = ?', [$m['id']]);
            $this->touch((int)$m['course_id']);
            flash('success', 'Module renamed.');
        }
        redirect('/manage/courses/' . $m['course_id']);
    }

    public function moduleDelete(string $id): string
    {
        $m = $this->module((int)$id);
        $files = DB::all('SELECT file_path FROM lessons WHERE module_id = ?', [$m['id']]);
        DB::q('DELETE FROM modules WHERE id = ?', [$m['id']]);
        foreach ($files as $f) {
            delete_upload($f['file_path']);
        }
        $this->touch((int)$m['course_id']);
        $this->recheckCourse((int)$m['course_id']);
        flash('success', 'Module “' . $m['title'] . '” and its lessons were deleted.');
        redirect('/manage/courses/' . $m['course_id']);
    }

    public function moduleMove(string $id): string
    {
        $m = $this->module((int)$id);
        $this->move('modules', 'course_id', (int)$m['course_id'], (int)$m['id'], input('dir') === 'up' ? -1 : 1);
        redirect('/manage/courses/' . $m['course_id']);
    }

    /** Swaps an item with its neighbour, renumbering positions 1..n first. */
    private function move(string $table, string $parentCol, int $parentId, int $itemId, int $dir): void
    {
        $ids = array_map('intval', array_column(DB::all("SELECT id FROM $table WHERE $parentCol = ? ORDER BY position, id", [$parentId]), 'id'));
        $i = array_search($itemId, $ids, true);
        $j = $i + $dir;
        if ($i === false || $j < 0 || $j >= count($ids)) {
            return;
        }
        [$ids[$i], $ids[$j]] = [$ids[$j], $ids[$i]];
        DB::tx(function () use ($table, $ids) {
            foreach ($ids as $pos => $rowId) {
                DB::update($table, ['position' => $pos + 1], 'id = ?', [$rowId]);
            }
        });
    }

    // ---- lessons ----------------------------------------------------------

    public function lessonForm(string $id): string
    {
        // $id is the module id for "new", the lesson id for "edit"
        if (str_contains($_SERVER['REQUEST_URI'] ?? '', '/lessons/new')) {
            $module = $this->module((int)$id);
            $lesson = ['id' => null, 'module_id' => $module['id'], 'title' => '', 'type' => 'text', 'body' => '', 'video_url' => '', 'file_name' => null, 'duration_min' => null];
        } else {
            $lesson = DB::one('SELECT * FROM lessons WHERE id = ?', [(int)$id]) ?? abort(404);
            $module = $this->module((int)$lesson['module_id']);
        }
        $course = $this->course((int)$module['course_id']);
        $modules = DB::all('SELECT id, title FROM modules WHERE course_id = ? ORDER BY position, id', [$course['id']]);
        return view('manage/lesson_form', ['lesson' => $lesson, 'module' => $module, 'modules' => $modules, 'course' => $course, 'errors' => [], 'title' => $lesson['id'] ? 'Edit lesson' : 'New lesson']);
    }

    public function lessonSave(string $id): string
    {
        $isNew = str_contains($_SERVER['REQUEST_URI'] ?? '', '/lessons/new');
        if ($isNew) {
            $module = $this->module((int)$id);
            $existing = null;
        } else {
            $existing = DB::one('SELECT * FROM lessons WHERE id = ?', [(int)$id]) ?? abort(404);
            $module = $this->module((int)$existing['module_id']);
        }
        $course = $this->course((int)$module['course_id']);

        $type = in_array(input('type'), ['text', 'video', 'file'], true) ? input('type') : 'text';
        $targetModule = input_int('module_id', (int)$module['id']);
        if (!DB::val('SELECT 1 FROM modules WHERE id = ? AND course_id = ?', [$targetModule, $course['id']])) {
            $targetModule = (int)$module['id'];
        }
        $data = [
            'module_id' => $targetModule,
            'title' => mb_substr((string)input('title'), 0, 200),
            'type' => $type,
            'body' => (string)input('body'),
            'video_url' => mb_substr((string)input('video_url'), 0, 500) ?: null,
            'duration_min' => input_int('duration_min'),
        ];
        $errors = [];
        if ($data['title'] === '') {
            $errors[] = 'Enter a lesson title.';
        }
        if ($type === 'video' && $data['video_url'] && !video_embed($data['video_url'])) {
            $errors[] = 'The video link must be a YouTube or Vimeo link, or a direct link to an .mp4/.webm file. You can also upload the video file instead.';
        }

        $upload = $_FILES['file'] ?? null;
        $hasUpload = $upload && ($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;
        if ($type === 'file' && !$hasUpload && !($existing['file_path'] ?? null)) {
            $errors[] = 'Choose a file to upload for this lesson.';
        }
        if ($type === 'video' && !$data['video_url'] && !$hasUpload && !($existing['file_path'] ?? null)) {
            $errors[] = 'Add a video link or upload a video file.';
        }
        if (!$errors && $hasUpload) {
            try {
                [$stored, $orig] = store_upload($upload);
                if ($existing && $existing['file_path']) {
                    delete_upload($existing['file_path']);
                }
                $data['file_path'] = $stored;
                $data['file_name'] = $orig;
            } catch (RuntimeException $e) {
                $errors[] = $e->getMessage();
            }
        }
        if (!$errors && $existing && checked('remove_file') && $existing['file_path'] && !$hasUpload) {
            delete_upload($existing['file_path']);
            $data['file_path'] = null;
            $data['file_name'] = null;
        }

        if ($errors) {
            $modules = DB::all('SELECT id, title FROM modules WHERE course_id = ? ORDER BY position, id', [$course['id']]);
            $lesson = array_merge($existing ?? ['id' => null, 'file_name' => null], $data);
            return view('manage/lesson_form', ['lesson' => $lesson, 'module' => $module, 'modules' => $modules, 'course' => $course, 'errors' => $errors, 'title' => $existing ? 'Edit lesson' : 'New lesson']);
        }

        if ($existing) {
            DB::update('lessons', $data, 'id = ?', [$existing['id']]);
            flash('success', 'Lesson saved.');
        } else {
            $data['position'] = (int)DB::val('SELECT COALESCE(MAX(position), 0) FROM lessons WHERE module_id = ?', [$targetModule]) + 1;
            DB::insert('lessons', $data);
            flash('success', 'Lesson added.');
            // A new lesson means previously completed learners have new work; their completion stays recorded.
        }
        $this->touch((int)$course['id']);
        redirect('/manage/courses/' . $course['id']);
    }

    public function lessonDelete(string $id): string
    {
        $lesson = DB::one('SELECT l.*, m.course_id FROM lessons l JOIN modules m ON m.id = l.module_id WHERE l.id = ?', [(int)$id]) ?? abort(404);
        DB::q('DELETE FROM lessons WHERE id = ?', [$lesson['id']]);
        delete_upload($lesson['file_path']);
        $this->touch((int)$lesson['course_id']);
        $this->recheckCourse((int)$lesson['course_id']);
        flash('success', 'Lesson “' . $lesson['title'] . '” deleted.');
        redirect('/manage/courses/' . $lesson['course_id']);
    }

    public function lessonMove(string $id): string
    {
        $lesson = DB::one('SELECT l.*, m.course_id FROM lessons l JOIN modules m ON m.id = l.module_id WHERE l.id = ?', [(int)$id]) ?? abort(404);
        $this->move('lessons', 'module_id', (int)$lesson['module_id'], (int)$lesson['id'], input('dir') === 'up' ? -1 : 1);
        redirect('/manage/courses/' . $lesson['course_id']);
    }

    /** After removing content, learners who now meet every requirement are marked complete. */
    private function recheckCourse(int $courseId): void
    {
        foreach (DB::all('SELECT user_id FROM enrolments WHERE course_id = ? AND completed_at IS NULL', [$courseId]) as $e) {
            Progress::checkCompletion((int)$e['user_id'], $courseId);
        }
    }

    // ---- enrolment --------------------------------------------------------

    public function enrolments(string $id): string
    {
        $course = $this->course((int)$id);
        $enrolled = DB::all(
            'SELECT e.*, u.name, u.email, u.employee_id, t.name AS team_name, a.name AS assigned_by_name
             FROM enrolments e
             JOIN users u ON u.id = e.user_id
             LEFT JOIN teams t ON t.id = u.team_id
             LEFT JOIN users a ON a.id = e.assigned_by
             WHERE e.course_id = ?
             ORDER BY u.name',
            [$course['id']]
        );
        $progress = Progress::map(array_map(fn($e) => (int)$e['user_id'], $enrolled), [(int)$course['id']]);
        foreach ($enrolled as &$e) {
            $e['pct'] = $progress[(int)$e['user_id']][(int)$course['id']]['pct'] ?? 0;
        }
        unset($e);
        $teamAssignments = DB::all(
            'SELECT tc.*, t.name, t.campaign, (SELECT COUNT(*) FROM users u WHERE u.team_id = t.id AND u.active = 1) AS members
             FROM team_courses tc JOIN teams t ON t.id = tc.team_id WHERE tc.course_id = ? ORDER BY t.name',
            [$course['id']]
        );
        $teams = DB::all('SELECT t.*, (SELECT COUNT(*) FROM users u WHERE u.team_id = t.id AND u.active = 1) AS members FROM teams t ORDER BY t.name');
        $users = DB::all(
            'SELECT u.id, u.name, u.email, u.role, t.name AS team_name FROM users u LEFT JOIN teams t ON t.id = u.team_id
             WHERE u.active = 1 AND u.id NOT IN (SELECT user_id FROM enrolments WHERE course_id = ?)
             ORDER BY t.name, u.name',
            [$course['id']]
        );
        return view('manage/enrolments', [
            'course' => $course, 'enrolled' => $enrolled, 'teamAssignments' => $teamAssignments,
            'teams' => $teams, 'users' => $users, 'title' => 'Enrolments: ' . $course['title'],
        ]);
    }

    public function enrolSave(string $id): string
    {
        $course = $this->course((int)$id);
        $due = (string)input('due_date');
        $due = preg_match('/^\d{4}-\d{2}-\d{2}$/', $due) ? $due : null;
        $count = 0;

        foreach ((array)($_POST['user_ids'] ?? []) as $userId) {
            if (DB::val('SELECT 1 FROM users WHERE id = ? AND active = 1', [(int)$userId])) {
                $count += Progress::enrol((int)$userId, (int)$course['id'], uid(), $due) ? 1 : 0;
            }
        }

        foreach ((array)($_POST['team_ids'] ?? []) as $teamId) {
            $teamId = (int)$teamId;
            if (!DB::val('SELECT 1 FROM teams WHERE id = ?', [$teamId])) {
                continue;
            }
            $dueDays = $due ? max(1, (int)ceil((strtotime($due) - strtotime(today())) / 86400)) : null;
            if (checked('auto_enrol_new')) {
                $exists = DB::val('SELECT id FROM team_courses WHERE team_id = ? AND course_id = ?', [$teamId, $course['id']]);
                if ($exists) {
                    DB::update('team_courses', ['due_days' => $dueDays], 'id = ?', [$exists]);
                } else {
                    DB::insert('team_courses', ['team_id' => $teamId, 'course_id' => $course['id'], 'due_days' => $dueDays, 'assigned_by' => uid(), 'created_at' => now()]);
                }
            }
            foreach (DB::all('SELECT id FROM users WHERE team_id = ? AND active = 1', [$teamId]) as $member) {
                $count += Progress::enrol((int)$member['id'], (int)$course['id'], uid(), $due) ? 1 : 0;
            }
        }

        if ($course['status'] !== 'published') {
            flash('info', 'Note: this course is still a draft, so learners will not see it until you publish it.');
        }
        flash('success', $count > 0 ? plural($count, 'learner') . ' enrolled.' : 'No new learners were enrolled (they may already be enrolled). Due dates were updated.');
        redirect('/manage/courses/' . $course['id'] . '/enrolments');
    }

    public function enrolDelete(string $id): string
    {
        $e = DB::one('SELECT * FROM enrolments WHERE id = ?', [(int)$id]) ?? abort(404);
        DB::q('DELETE FROM enrolments WHERE id = ?', [$e['id']]);
        flash('success', 'Learner removed from the course. Their past progress is kept if they are enrolled again.');
        redirect('/manage/courses/' . $e['course_id'] . '/enrolments');
    }

    public function teamCourseDelete(string $id): string
    {
        $tc = DB::one('SELECT * FROM team_courses WHERE id = ?', [(int)$id]) ?? abort(404);
        DB::q('DELETE FROM team_courses WHERE id = ?', [$tc['id']]);
        flash('success', 'New team members will no longer be enrolled automatically. Current enrolments are unchanged.');
        redirect('/manage/courses/' . $tc['course_id'] . '/enrolments');
    }
}
