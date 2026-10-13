<?php
declare(strict_types=1);

namespace App\Controllers;

use DB;
use Progress;

final class QuizController
{
    /** Seconds of grace after the time limit before a late submission is refused. */
    private const GRACE_SECONDS = 90;

    private function loadQuiz(int $id): array
    {
        $quiz = DB::one('SELECT * FROM quizzes WHERE id = ?', [$id]);
        if (!$quiz) {
            abort(404, 'This quiz does not exist.');
        }
        return $quiz;
    }

    private function loadAttempt(int $id): array
    {
        $a = DB::one('SELECT * FROM quiz_attempts WHERE id = ?', [$id]);
        if (!$a) {
            abort(404, 'This attempt does not exist.');
        }
        $canSeeOthers = has_role('admin', 'trainer') || (has_role('team_lead') && in_array(
            (int)DB::val('SELECT team_id FROM users WHERE id = ?', [$a['user_id']]),
            visible_team_ids() ?? [],
            true
        ));
        if ((int)$a['user_id'] !== uid() && !$canSeeOthers) {
            abort(403);
        }
        return $a;
    }

    private function deadline(array $quiz, array $attempt): ?int
    {
        return $quiz['time_limit_min'] ? strtotime($attempt['started_at']) + (int)$quiz['time_limit_min'] * 60 : null;
    }

    public function intro(string $id): string
    {
        $u = require_login();
        $quiz = $this->loadQuiz((int)$id);
        $course = LearnController::viewableCourse((int)$quiz['course_id']);
        $enrolled = Progress::isEnrolled($u['id'], (int)$course['id']);

        $attempts = DB::all(
            "SELECT * FROM quiz_attempts WHERE user_id = ? AND quiz_id = ? ORDER BY started_at DESC, id DESC",
            [$u['id'], $quiz['id']]
        );
        $submitted = array_values(array_filter($attempts, fn($a) => $a['status'] === 'submitted'));
        $open = null;
        foreach ($attempts as $a) {
            if ($a['status'] === 'in_progress') {
                $open = $a;
                break;
            }
        }
        $questionCount = (int)DB::val('SELECT COUNT(*) FROM questions WHERE quiz_id = ?', [$quiz['id']]);
        $remaining = (int)$quiz['max_attempts'] > 0 ? max(0, (int)$quiz['max_attempts'] - count($submitted)) : null;
        $passed = (bool)array_filter($submitted, fn($a) => (int)$a['passed'] === 1);

        return view('quiz_intro', [
            'quiz' => $quiz, 'course' => $course, 'enrolled' => $enrolled, 'attempts' => $submitted,
            'open' => $open, 'questionCount' => $questionCount, 'remaining' => $remaining, 'passed' => $passed,
            'title' => $quiz['title'],
        ]);
    }

    public function start(string $id): string
    {
        $u = require_login();
        $quiz = $this->loadQuiz((int)$id);
        LearnController::viewableCourse((int)$quiz['course_id']);
        if (!Progress::isEnrolled($u['id'], (int)$quiz['course_id'])) {
            abort(403, 'You need to be enrolled in the course to take this quiz.');
        }

        $open = DB::one("SELECT * FROM quiz_attempts WHERE user_id = ? AND quiz_id = ? AND status = 'in_progress' ORDER BY id DESC", [$u['id'], $quiz['id']]);
        if ($open) {
            redirect('/attempts/' . $open['id']);
        }
        $used = (int)DB::val("SELECT COUNT(*) FROM quiz_attempts WHERE user_id = ? AND quiz_id = ? AND status = 'submitted'", [$u['id'], $quiz['id']]);
        if ((int)$quiz['max_attempts'] > 0 && $used >= (int)$quiz['max_attempts']) {
            flash('error', 'You have used all your attempts for this quiz.');
            redirect('/quizzes/' . $quiz['id']);
        }
        $ids = array_map('intval', array_column(DB::all('SELECT id FROM questions WHERE quiz_id = ? ORDER BY position, id', [$quiz['id']]), 'id'));
        if (!$ids) {
            flash('error', 'This quiz has no questions yet.');
            redirect('/quizzes/' . $quiz['id']);
        }
        if ((int)$quiz['shuffle_questions'] === 1) {
            shuffle($ids);
        }
        $attemptId = DB::insert('quiz_attempts', [
            'user_id' => $u['id'], 'quiz_id' => $quiz['id'], 'status' => 'in_progress',
            'question_order' => json_encode($ids), 'started_at' => now(),
        ]);
        redirect('/attempts/' . $attemptId);
    }

    /** Questions of an attempt in the order the learner saw them, with their choices. */
    private function attemptQuestions(array $attempt): array
    {
        $order = json_decode((string)$attempt['question_order'], true) ?: [];
        if (!$order) {
            return [];
        }
        $rows = DB::all('SELECT * FROM questions WHERE id IN (' . DB::in($order) . ')', $order);
        $byId = [];
        foreach ($rows as $r) {
            $byId[(int)$r['id']] = $r + ['choices' => []];
        }
        foreach (DB::all('SELECT * FROM choices WHERE question_id IN (' . DB::in($order) . ') ORDER BY position, id', $order) as $c) {
            if (isset($byId[(int)$c['question_id']])) {
                $byId[(int)$c['question_id']]['choices'][] = $c;
            }
        }
        $out = [];
        foreach ($order as $qid) {
            if (isset($byId[$qid])) {
                $out[] = $byId[$qid];
            }
        }
        return $out;
    }

    public function take(string $id): string
    {
        $attempt = $this->loadAttempt((int)$id);
        if ((int)$attempt['user_id'] !== uid()) {
            abort(403);
        }
        if ($attempt['status'] !== 'in_progress') {
            redirect('/attempts/' . $attempt['id'] . '/result');
        }
        $quiz = $this->loadQuiz((int)$attempt['quiz_id']);
        $course = LearnController::viewableCourse((int)$quiz['course_id']);
        $deadline = $this->deadline($quiz, $attempt);
        if ($deadline && time() > $deadline + self::GRACE_SECONDS) {
            $this->grade($attempt, $quiz, []);
            flash('error', 'Time ran out for this attempt, so it was submitted without further answers.');
            redirect('/attempts/' . $attempt['id'] . '/result');
        }
        return view('quiz_take', [
            'attempt' => $attempt, 'quiz' => $quiz, 'course' => $course,
            'questions' => $this->attemptQuestions($attempt),
            'secondsLeft' => $deadline ? max(0, $deadline - time()) : null,
            'title' => $quiz['title'],
        ]);
    }

    public function submit(string $id): string
    {
        $attempt = $this->loadAttempt((int)$id);
        if ((int)$attempt['user_id'] !== uid()) {
            abort(403);
        }
        if ($attempt['status'] !== 'in_progress') {
            redirect('/attempts/' . $attempt['id'] . '/result');
        }
        $quiz = $this->loadQuiz((int)$attempt['quiz_id']);
        $deadline = $this->deadline($quiz, $attempt);
        $answers = (array)($_POST['answers'] ?? []);
        if ($deadline && time() > $deadline + self::GRACE_SECONDS) {
            $answers = [];
            flash('error', 'This attempt was submitted after the time limit, so the answers could not be accepted.');
        }
        $this->grade($attempt, $quiz, $answers);
        redirect('/attempts/' . $attempt['id'] . '/result');
    }

    /**
     * Scores an attempt. Single choice and true/false: the chosen option must be correct.
     * Multiple choice: the selected set must match the correct set exactly.
     */
    private function grade(array $attempt, array $quiz, array $answers): void
    {
        $questions = $this->attemptQuestions($attempt);
        DB::tx(function () use ($attempt, $quiz, $answers, $questions) {
            // Lock against double submission
            $changed = DB::update('quiz_attempts', ['status' => 'grading'], "id = ? AND status = 'in_progress'", [$attempt['id']]);
            if ($changed === 0) {
                return;
            }
            $score = 0;
            $max = 0;
            foreach ($questions as $q) {
                $qid = (int)$q['id'];
                $valid = array_map(fn($c) => (int)$c['id'], $q['choices']);
                $correctSet = array_map(fn($c) => (int)$c['id'], array_filter($q['choices'], fn($c) => (int)$c['is_correct'] === 1));
                $raw = $answers[$qid] ?? [];
                $selected = array_values(array_unique(array_intersect(array_map('intval', (array)$raw), $valid)));
                sort($selected);
                sort($correctSet);
                $isCorrect = $selected && $selected === array_values($correctSet);
                $pts = (int)$q['points'];
                $max += $pts;
                if ($isCorrect) {
                    $score += $pts;
                }
                DB::insert('attempt_answers', [
                    'attempt_id' => $attempt['id'], 'question_id' => $qid,
                    'selected' => implode(',', $selected), 'correct' => $isCorrect ? 1 : 0, 'points' => $isCorrect ? $pts : 0,
                ]);
            }
            $percent = $max > 0 ? (int)floor($score * 100 / $max) : 0;
            DB::update('quiz_attempts', [
                'status' => 'submitted', 'submitted_at' => now(), 'score' => $score, 'max_score' => $max,
                'percent' => $percent, 'passed' => $percent >= (int)$quiz['pass_mark'] ? 1 : 0,
            ], 'id = ?', [$attempt['id']]);
        });
        Progress::checkCompletion((int)$attempt['user_id'], (int)$quiz['course_id']);
    }

    public function result(string $id): string
    {
        $attempt = $this->loadAttempt((int)$id);
        if ($attempt['status'] !== 'submitted') {
            if ((int)$attempt['user_id'] === uid()) {
                redirect('/attempts/' . $attempt['id']);
            }
            abort(404, 'This attempt has not been submitted yet.');
        }
        $quiz = $this->loadQuiz((int)$attempt['quiz_id']);
        $course = DB::one('SELECT * FROM courses WHERE id = ?', [$quiz['course_id']]);
        $questions = $this->attemptQuestions($attempt);
        $answers = [];
        foreach (DB::all('SELECT * FROM attempt_answers WHERE attempt_id = ?', [$attempt['id']]) as $a) {
            $answers[(int)$a['question_id']] = $a + ['ids' => array_map('intval', array_filter(explode(',', (string)$a['selected']), 'strlen'))];
        }
        $isOwner = (int)$attempt['user_id'] === uid();
        $showAnswers = (int)$quiz['show_answers'] === 1 || !$isOwner;
        $learner = DB::one('SELECT id, name FROM users WHERE id = ?', [$attempt['user_id']]);

        $usedAttempts = (int)DB::val("SELECT COUNT(*) FROM quiz_attempts WHERE user_id = ? AND quiz_id = ? AND status = 'submitted'", [$attempt['user_id'], $quiz['id']]);
        $canRetry = $isOwner && ((int)$quiz['max_attempts'] === 0 || $usedAttempts < (int)$quiz['max_attempts']);
        $courseComplete = (bool)DB::val('SELECT completed_at FROM enrolments WHERE user_id = ? AND course_id = ?', [$attempt['user_id'], $quiz['course_id']]);

        return view('quiz_result', [
            'attempt' => $attempt, 'quiz' => $quiz, 'course' => $course, 'questions' => $questions,
            'answers' => $answers, 'showAnswers' => $showAnswers, 'isOwner' => $isOwner, 'learner' => $learner,
            'canRetry' => $canRetry, 'courseComplete' => $courseComplete,
            'title' => 'Result: ' . $quiz['title'],
        ]);
    }
}
