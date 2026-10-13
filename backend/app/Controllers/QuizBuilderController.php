<?php
declare(strict_types=1);

namespace App\Controllers;

use DB;

/** Quiz and question authoring, for administrators and trainers. */
final class QuizBuilderController
{
    public function __construct()
    {
        require_role('admin', 'trainer');
    }

    private function quizRow(int $id): array
    {
        return DB::one('SELECT * FROM quizzes WHERE id = ?', [$id]) ?? abort(404, 'This quiz does not exist.');
    }

    private function courseRow(int $id): array
    {
        return DB::one('SELECT * FROM courses WHERE id = ?', [$id]) ?? abort(404, 'This course does not exist.');
    }

    public function quiz(string $id): string
    {
        $quiz = $this->quizRow((int)$id);
        $course = $this->courseRow((int)$quiz['course_id']);
        $questions = DB::all('SELECT * FROM questions WHERE quiz_id = ? ORDER BY position, id', [$quiz['id']]);
        $choices = [];
        if ($questions) {
            $ids = array_map(fn($q) => (int)$q['id'], $questions);
            foreach (DB::all('SELECT * FROM choices WHERE question_id IN (' . DB::in($ids) . ') ORDER BY position, id', $ids) as $c) {
                $choices[(int)$c['question_id']][] = $c;
            }
        }
        $attempts = (int)DB::val("SELECT COUNT(*) FROM quiz_attempts WHERE quiz_id = ? AND status = 'submitted'", [$quiz['id']]);
        return view('manage/quiz', ['quiz' => $quiz, 'course' => $course, 'questions' => $questions, 'choices' => $choices, 'attempts' => $attempts, 'title' => $quiz['title']]);
    }

    public function quizForm(string $id): string
    {
        if (str_contains($_SERVER['REQUEST_URI'] ?? '', '/quizzes/new')) {
            $course = $this->courseRow((int)$id);
            $quiz = ['id' => null, 'course_id' => $course['id'], 'title' => '', 'description' => '', 'pass_mark' => 70, 'time_limit_min' => null, 'max_attempts' => 0, 'show_answers' => 1, 'shuffle_questions' => 0];
        } else {
            $quiz = $this->quizRow((int)$id);
            $course = $this->courseRow((int)$quiz['course_id']);
        }
        return view('manage/quiz_form', ['quiz' => $quiz, 'course' => $course, 'errors' => [], 'title' => $quiz['id'] ? 'Quiz settings' : 'New quiz']);
    }

    public function quizSave(string $id): string
    {
        $isNew = str_contains($_SERVER['REQUEST_URI'] ?? '', '/quizzes/new');
        $existing = $isNew ? null : $this->quizRow((int)$id);
        $course = $this->courseRow($isNew ? (int)$id : (int)$existing['course_id']);

        $data = [
            'title' => mb_substr((string)input('title'), 0, 200),
            'description' => (string)input('description'),
            'pass_mark' => max(0, min(100, input_int('pass_mark', 70))),
            'time_limit_min' => ($t = input_int('time_limit_min')) && $t > 0 ? $t : null,
            'max_attempts' => max(0, input_int('max_attempts', 0)),
            'show_answers' => checked('show_answers'),
            'shuffle_questions' => checked('shuffle_questions'),
        ];
        if ($data['title'] === '') {
            return view('manage/quiz_form', ['quiz' => array_merge($existing ?? ['id' => null, 'course_id' => $course['id']], $data), 'course' => $course, 'errors' => ['Enter a quiz title.'], 'title' => $existing ? 'Quiz settings' : 'New quiz']);
        }
        if ($existing) {
            DB::update('quizzes', $data, 'id = ?', [$existing['id']]);
            flash('success', 'Quiz settings saved. Changes to the pass mark apply to new attempts.');
            redirect('/manage/quizzes/' . $existing['id']);
        }
        $data['course_id'] = $course['id'];
        $data['position'] = (int)DB::val('SELECT COALESCE(MAX(position), 0) FROM quizzes WHERE course_id = ?', [$course['id']]) + 1;
        $newId = DB::insert('quizzes', $data);
        DB::update('courses', ['updated_at' => now()], 'id = ?', [$course['id']]);
        flash('success', 'Quiz created. Now add questions.');
        redirect('/manage/quizzes/' . $newId);
    }

    public function quizDelete(string $id): string
    {
        $quiz = $this->quizRow((int)$id);
        DB::q('DELETE FROM quizzes WHERE id = ?', [$quiz['id']]);
        flash('success', 'Quiz “' . $quiz['title'] . '” and its results were deleted.');
        redirect('/manage/courses/' . $quiz['course_id']);
    }

    // ---- questions --------------------------------------------------------

    public function questionForm(string $id): string
    {
        if (str_contains($_SERVER['REQUEST_URI'] ?? '', '/questions/new')) {
            $quiz = $this->quizRow((int)$id);
            $question = ['id' => null, 'quiz_id' => $quiz['id'], 'body' => '', 'type' => 'single', 'points' => 1, 'explanation' => ''];
            $choices = [];
        } else {
            $question = DB::one('SELECT * FROM questions WHERE id = ?', [(int)$id]) ?? abort(404);
            $quiz = $this->quizRow((int)$question['quiz_id']);
            $choices = DB::all('SELECT * FROM choices WHERE question_id = ? ORDER BY position, id', [$question['id']]);
        }
        $course = $this->courseRow((int)$quiz['course_id']);
        return view('manage/question_form', ['question' => $question, 'choices' => $choices, 'quiz' => $quiz, 'course' => $course, 'errors' => [], 'title' => $question['id'] ? 'Edit question' : 'New question']);
    }

    public function questionSave(string $id): string
    {
        $isNew = str_contains($_SERVER['REQUEST_URI'] ?? '', '/questions/new');
        $existing = $isNew ? null : (DB::one('SELECT * FROM questions WHERE id = ?', [(int)$id]) ?? abort(404));
        $quiz = $this->quizRow($isNew ? (int)$id : (int)$existing['quiz_id']);
        $course = $this->courseRow((int)$quiz['course_id']);

        $type = in_array(input('type'), ['single', 'multiple', 'truefalse'], true) ? input('type') : 'single';
        $data = [
            'body' => (string)input('body'),
            'type' => $type,
            'points' => max(1, min(100, input_int('points', 1))),
            'explanation' => (string)input('explanation') ?: null,
        ];

        // Collect choices
        $choices = [];
        if ($type === 'truefalse') {
            $answer = input('tf_answer') === 'false' ? 'false' : 'true';
            $choices = [['body' => 'True', 'is_correct' => $answer === 'true' ? 1 : 0], ['body' => 'False', 'is_correct' => $answer === 'false' ? 1 : 0]];
        } else {
            $bodies = (array)($_POST['choice'] ?? []);
            $correct = array_map('intval', (array)($_POST['correct'] ?? []));
            foreach ($bodies as $i => $b) {
                $b = trim((string)$b);
                if ($b !== '') {
                    $choices[] = ['body' => mb_substr($b, 0, 500), 'is_correct' => in_array((int)$i, $correct, true) ? 1 : 0];
                }
            }
        }

        $errors = [];
        if ($data['body'] === '') {
            $errors[] = 'Enter the question text.';
        }
        $nCorrect = count(array_filter($choices, fn($c) => $c['is_correct'] === 1));
        if ($type !== 'truefalse') {
            if (count($choices) < 2) {
                $errors[] = 'Add at least two answer options.';
            }
            if ($type === 'single' && $nCorrect !== 1) {
                $errors[] = 'A single-answer question needs exactly one correct option.';
            }
            if ($type === 'multiple' && $nCorrect < 1) {
                $errors[] = 'Mark at least one option as correct.';
            }
        }
        if ($errors) {
            return view('manage/question_form', [
                'question' => array_merge($existing ?? ['id' => null, 'quiz_id' => $quiz['id']], $data),
                'choices' => $choices, 'quiz' => $quiz, 'course' => $course, 'errors' => $errors,
                'title' => $existing ? 'Edit question' : 'New question',
            ]);
        }

        DB::tx(function () use ($existing, $quiz, $data, $choices) {
            $oldIds = [];
            if ($existing) {
                DB::update('questions', $data, 'id = ?', [$existing['id']]);
                $qid = (int)$existing['id'];
                // Keep choice ids stable (update in place) so past attempts still show what was picked
                $oldIds = array_map('intval', array_column(DB::all('SELECT id FROM choices WHERE question_id = ? ORDER BY position, id', [$qid]), 'id'));
            } else {
                $data['quiz_id'] = $quiz['id'];
                $data['position'] = (int)DB::val('SELECT COALESCE(MAX(position), 0) FROM questions WHERE quiz_id = ?', [$quiz['id']]) + 1;
                $qid = DB::insert('questions', $data);
            }
            foreach ($choices as $i => $c) {
                $row = ['body' => $c['body'], 'is_correct' => $c['is_correct'], 'position' => $i + 1];
                if (isset($oldIds[$i])) {
                    DB::update('choices', $row, 'id = ?', [$oldIds[$i]]);
                } else {
                    DB::insert('choices', $row + ['question_id' => $qid]);
                }
            }
            foreach (array_slice($oldIds, count($choices)) as $extra) {
                DB::q('DELETE FROM choices WHERE id = ?', [$extra]);
            }
        });

        flash('success', $existing ? 'Question saved.' : 'Question added.');
        if (input('then') === 'another') {
            redirect('/manage/quizzes/' . $quiz['id'] . '/questions/new');
        }
        redirect('/manage/quizzes/' . $quiz['id']);
    }

    public function questionDelete(string $id): string
    {
        $q = DB::one('SELECT * FROM questions WHERE id = ?', [(int)$id]) ?? abort(404);
        DB::q('DELETE FROM questions WHERE id = ?', [$q['id']]);
        flash('success', 'Question deleted.');
        redirect('/manage/quizzes/' . $q['quiz_id']);
    }
}
