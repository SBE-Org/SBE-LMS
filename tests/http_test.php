<?php
declare(strict_types=1);

/**
 * End-to-end test: drives the running app over HTTP as every role.
 *
 *   1. php backend/bin/install.php --admin-email=admin@shaggar.test --admin-password=Admin@12345 --demo
 *   2. php -S 127.0.0.1:8765 -t frontend/public frontend/public/index.php
 *   3. php tests/http_test.php http://127.0.0.1:8765
 *
 * Use the same DB_* environment variables for all three commands.
 */
require dirname(__DIR__) . '/backend/app/bootstrap.php';

$base = rtrim($argv[1] ?? 'http://127.0.0.1:8765', '/');
$pass = 0;
$fail = 0;

final class Client
{
    private string $jar;
    public int $status = 0;
    public string $body = '';
    public string $location = '';
    public array $headers = [];

    public function __construct(private string $base)
    {
        $this->jar = tempnam(sys_get_temp_dir(), 'jar');
    }

    public function req(string $method, string $path, array $data = [], bool $follow = true, array $files = []): self
    {
        $ch = curl_init($this->base . $path);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true, CURLOPT_COOKIEJAR => $this->jar,
            CURLOPT_COOKIEFILE => $this->jar, CURLOPT_FOLLOWLOCATION => $follow, CURLOPT_TIMEOUT => 20,
            CURLOPT_HTTPHEADER => ['Referer: ' . $this->base . '/'],
        ]);
        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            if ($files) {
                $fields = [];
                foreach ($data as $k => $v) {
                    if (is_array($v)) {
                        foreach ($v as $i => $vv) {
                            $fields["{$k}[$i]"] = $vv;
                        }
                    } else {
                        $fields[$k] = $v;
                    }
                }
                foreach ($files as $k => [$path, $mime, $name]) {
                    $fields[$k] = new CURLFile($path, $mime, $name);
                }
                curl_setopt($ch, CURLOPT_POSTFIELDS, $fields);
            } else {
                curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($data));
            }
        }
        $raw = (string)curl_exec($ch);
        $hsize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $this->status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $head = substr($raw, 0, $hsize);
        $this->body = substr($raw, $hsize);
        $this->location = preg_match_all('/^Location:\s*(.+)$/mi', $head, $m) ? trim(end($m[1])) : '';
        $this->headers = explode("\n", $head);
        curl_close($ch);
        return $this;
    }

    public function get(string $path, bool $follow = true): self
    {
        return $this->req('GET', $path, [], $follow);
    }

    public function token(): string
    {
        return preg_match('/name="_csrf" value="([a-f0-9]+)"/', $this->body, $m) ? $m[1] : '';
    }

    /** GET a page to obtain a CSRF token, then POST. */
    public function post(string $path, array $data = [], string $tokenFrom = '/', bool $follow = true, array $files = []): self
    {
        $this->get($tokenFrom);
        $data['_csrf'] = $this->token();
        return $this->req('POST', $path, $data, $follow, $files);
    }

    public function login(string $email, string $password): self
    {
        $this->get('/login');
        return $this->req('POST', '/login', ['_csrf' => $this->token(), 'email' => $email, 'password' => $password]);
    }
}

function check(string $name, bool $ok, string $detail = ''): void
{
    global $pass, $fail;
    if ($ok) {
        $pass++;
        echo "  ✓ $name\n";
    } else {
        $fail++;
        echo "  ✗ $name" . ($detail ? "  [$detail]" : '') . "\n";
    }
}

/** Page loaded, expected text present, and no PHP warnings leaked into the HTML. */
function page(Client $c, string $path, string $expect, int $status = 200): void
{
    $c->get($path);
    $clean = !preg_match('/(Warning|Notice|Deprecated|Fatal error|Uncaught)\b.*?:/', strip_tags($c->body)) && !str_contains($c->body, 'Something went wrong');
    $detail = "HTTP {$c->status}";
    if (!$clean && preg_match('/(Warning|Notice|Deprecated|Fatal error|Uncaught|Something went wrong)[^\n]{0,220}/', strip_tags($c->body), $m)) {
        $detail .= ' ' . trim($m[0]);
    }
    check("GET $path", $c->status === $status && str_contains($c->body, $expect) && $clean, $detail . (str_contains($c->body, $expect) ? '' : " missing '$expect'"));
}

echo "Public pages\n";
$anon = new Client($base);
page($anon, '/login', 'Sign in');
$anon->get('/', false);
check('Dashboard redirects to login when signed out', $anon->status === 302 && str_ends_with($anon->location, '/login'));
page($anon, '/verify', 'Verify a certificate');
$code = (string)DB::val('SELECT code FROM certificates LIMIT 1');
page($anon, '/verify?code=' . $code, 'Valid certificate');
page($anon, '/verify?code=SHG-FAKE', 'Not found');
$anon->get('/install');
check('Installer is closed once installed', $anon->status === 404);
$anon->login('abebe.kebede@shaggar.test', 'wrong-password');
check('Wrong password is rejected', str_contains($anon->body, 'do not match'));
$anon->req('POST', '/login', ['email' => 'x', 'password' => 'y']);
check('POST without CSRF token is refused (419)', $anon->status === 419);
page($anon, '/no-such-page', 'Page not found', 404);

// ---------------------------------------------------------------- agent
echo "\nAgent journey\n";
$agentRow = DB::one("SELECT u.* FROM users u WHERE u.role = 'agent' AND EXISTS (SELECT 1 FROM enrolments e WHERE e.user_id = u.id AND e.completed_at IS NULL) ORDER BY u.id LIMIT 1");
$agent = new Client($base);
$agent->login($agentRow['email'], 'Welcome@123');
check('Agent signs in and sees dashboard', str_contains($agent->body, 'My learning'), $agentRow['email']);
page($agent, '/', 'My learning');
page($agent, '/courses', 'Courses');
page($agent, '/certificates', 'My certificates');
page($agent, '/account/password', 'Change password');

$enrol = DB::one('SELECT e.*, c.title FROM enrolments e JOIN courses c ON c.id = e.course_id WHERE e.user_id = ? AND e.completed_at IS NULL ORDER BY e.id LIMIT 1', [$agentRow['id']]);
$cid = (int)$enrol['course_id'];
page($agent, "/courses/$cid", e($enrol['title']));
$lessons = array_map('intval', array_column(DB::all('SELECT l.id FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = ? ORDER BY m.position, l.position', [$cid]), 'id'));
page($agent, '/lessons/' . $lessons[0], 'lesson-foot');
foreach ($lessons as $lid) {
    $agent->post("/lessons/$lid/complete", [], "/lessons/$lid");
}
$done = (int)DB::val('SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN modules m ON m.id = l.module_id WHERE lp.user_id = ? AND m.course_id = ?', [$agentRow['id'], $cid]);
check('All lessons marked complete', $done === count($lessons), "$done/" . count($lessons));

$quiz = DB::one('SELECT * FROM quizzes WHERE course_id = ? ORDER BY id LIMIT 1', [$cid]);
page($agent, '/quizzes/' . $quiz['id'], 'Pass mark');
// Make sure an attempt is available for the test
DB::q("DELETE FROM quiz_attempts WHERE user_id = ? AND quiz_id = ?", [$agentRow['id'], $quiz['id']]);
$agent->post('/quizzes/' . $quiz['id'] . '/start', [], '/quizzes/' . $quiz['id']);
check('Quiz starts and shows questions', str_contains($agent->body, 'data-quiz-form') && preg_match('#/attempts/(\d+)#', $agent->body, $am) === 1, "HTTP {$agent->status}");
$attemptId = (int)($am[1] ?? 0);

// First attempt: everything wrong -> not passed
$wrong = [];
foreach (DB::all('SELECT id FROM questions WHERE quiz_id = ?', [$quiz['id']]) as $q) {
    $wrong[$q['id']] = [(int)DB::val('SELECT id FROM choices WHERE question_id = ? AND is_correct = 0 LIMIT 1', [$q['id']])];
}
$agent->req('POST', "/attempts/$attemptId", ['_csrf' => $agent->token(), 'answers' => $wrong]);
check('Wrong answers → not passed', str_contains($agent->body, 'Not passed this time'), "HTTP {$agent->status}");
$a = DB::one('SELECT * FROM quiz_attempts WHERE id = ?', [$attemptId]);
check('Attempt scored 0%', (int)$a['percent'] === 0 && $a['status'] === 'submitted');
$agent->req('POST', "/attempts/$attemptId", ['_csrf' => $agent->token(), 'answers' => []]);
check('Re-submitting a graded attempt changes nothing', (int)DB::val('SELECT COUNT(*) FROM attempt_answers WHERE attempt_id = ?', [$attemptId]) === count($wrong));

// Second attempt: all correct -> passed + course complete + certificate
$agent->post('/quizzes/' . $quiz['id'] . '/start', [], '/quizzes/' . $quiz['id']);
preg_match('#/attempts/(\d+)#', $agent->body, $am);
$attempt2 = (int)($am[1] ?? 0);
$right = [];
foreach (DB::all('SELECT id FROM questions WHERE quiz_id = ?', [$quiz['id']]) as $q) {
    $right[$q['id']] = array_map('intval', array_column(DB::all('SELECT id FROM choices WHERE question_id = ? AND is_correct = 1', [$q['id']]), 'id'));
}
$agent->req('POST', "/attempts/$attempt2", ['_csrf' => $agent->token(), 'answers' => $right]);
check('Correct answers → passed with 100%', str_contains($agent->body, '>Passed<') && (int)DB::val('SELECT percent FROM quiz_attempts WHERE id = ?', [$attempt2]) === 100, "HTTP {$agent->status}");
$quizCount = (int)DB::val('SELECT COUNT(*) FROM quizzes WHERE course_id = ?', [$cid]);
if ($quizCount === 1) {
    check('Course marked complete', (bool)DB::val('SELECT completed_at FROM enrolments WHERE user_id = ? AND course_id = ?', [$agentRow['id'], $cid]));
    $cert = DB::val('SELECT code FROM certificates WHERE user_id = ? AND course_id = ?', [$agentRow['id'], $cid]);
    check('Certificate issued', (bool)$cert);
    page($agent, '/certificates/' . $cert, 'Certificate of Completion');
}

page($agent, '/attempts/' . $attempt2 . '/result', 'Review');
$agent->get('/manage/courses');
check('Agent cannot open course management (403)', $agent->status === 403);
$agent->get('/admin/users');
check('Agent cannot open people admin (403)', $agent->status === 403);
$agent->get('/reports');
check('Agent cannot open reports (403)', $agent->status === 403);
$otherAttempt = (int)DB::val("SELECT id FROM quiz_attempts WHERE user_id <> ? AND status = 'submitted' LIMIT 1", [$agentRow['id']]);
$agent->get("/attempts/$otherAttempt/result");
check("Agent cannot see another person's quiz answers (403)", $agent->status === 403);
$otherCert = (string)DB::val('SELECT code FROM certificates WHERE user_id <> ? LIMIT 1', [$agentRow['id']]);
$agent->get("/certificates/$otherCert");
check("Agent cannot open another person's certificate (403)", $agent->status === 403);
$notEnrolled = DB::val("SELECT c.id FROM courses c WHERE c.self_enrol = 0 AND c.id NOT IN (SELECT course_id FROM enrolments WHERE user_id = ?) LIMIT 1", [$agentRow['id']]);
if ($notEnrolled) {
    $agent->get("/courses/$notEnrolled");
    check('Agent cannot open a course they are not enrolled in (403)', $agent->status === 403);
}
$open = DB::val("SELECT c.id FROM courses c WHERE c.self_enrol = 1 AND c.status = 'published' AND c.id NOT IN (SELECT course_id FROM enrolments WHERE user_id = ?) LIMIT 1", [$agentRow['id']]);
if ($open) {
    $agent->post("/courses/$open/enrol", [], "/courses/$open");
    check('Agent can join an open course', Progress::isEnrolled((int)$agentRow['id'], (int)$open));
}

// ---------------------------------------------------------------- trainer
echo "\nTrainer: build a course\n";
$tr = new Client($base);
$tr->login('trainer@shaggar.test', 'Welcome@123');
page($tr, '/manage/courses', 'Manage courses');
page($tr, '/manage/courses/new', 'New course');
$tr->post('/manage/courses/new', ['title' => 'Escalation Handling ዓለም', 'summary' => 'When and how to escalate.', 'category' => 'Customer Service', 'status' => 'draft', 'certificate_enabled' => 1], '/manage/courses/new');
$newCourse = (int)DB::val("SELECT id FROM courses WHERE title = 'Escalation Handling ዓለም'");
check('Course created (with Amharic text)', $newCourse > 0 && str_contains($tr->body, 'Escalation Handling ዓለም'));
$mod = (int)DB::val('SELECT id FROM modules WHERE course_id = ?', [$newCourse]);
$tr->post("/manage/courses/$newCourse/modules", ['title' => 'Module 2: Tools'], "/manage/courses/$newCourse");
check('Module added', (int)DB::val('SELECT COUNT(*) FROM modules WHERE course_id = ?', [$newCourse]) === 2);
page($tr, "/manage/modules/$mod/lessons/new", 'New lesson');
$tr->post("/manage/modules/$mod/lessons/new", ['title' => 'When to escalate', 'type' => 'text', 'module_id' => $mod, 'body' => "# Rules\n- **Always** escalate threats\n<script>alert(1)</script>", 'duration_min' => 5], "/manage/modules/$mod/lessons/new");
$l1 = (int)DB::val("SELECT id FROM lessons WHERE title = 'When to escalate'");
check('Text lesson added', $l1 > 0);
$pdf = tempnam(sys_get_temp_dir(), 'pdf');
file_put_contents($pdf, "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
$tr->post("/manage/modules/$mod/lessons/new", ['title' => 'Escalation form (PDF)', 'type' => 'file', 'module_id' => $mod, 'body' => ''], "/manage/modules/$mod/lessons/new", true, ['file' => [$pdf, 'application/pdf', 'escalation-form.pdf']]);
$l2 = DB::one("SELECT * FROM lessons WHERE title = 'Escalation form (PDF)'");
check('File lesson uploaded', $l2 && $l2['file_name'] === 'escalation-form.pdf' && is_file(config('uploads_dir') . '/' . $l2['file_path']));
$bad = tempnam(sys_get_temp_dir(), 'exe');
file_put_contents($bad, 'MZ');
$tr->post("/manage/modules/$mod/lessons/new", ['title' => 'Bad file', 'type' => 'file', 'module_id' => $mod], "/manage/modules/$mod/lessons/new", true, ['file' => [$bad, 'application/octet-stream', 'virus.exe']]);
check('Disallowed file type is rejected', str_contains($tr->body, 'not allowed') && !DB::val("SELECT id FROM lessons WHERE title = 'Bad file'"));
$tr->post("/manage/modules/$mod/lessons/new", ['title' => 'Video lesson', 'type' => 'video', 'module_id' => $mod, 'video_url' => 'https://youtu.be/aaaaaaaaaaa'], "/manage/modules/$mod/lessons/new");
check('Video lesson added', (bool)DB::val("SELECT id FROM lessons WHERE title = 'Video lesson'"));
$tr->post("/manage/lessons/$l1/move", ['dir' => 'down'], "/manage/courses/$newCourse");
check('Lesson reordered', (int)DB::val('SELECT position FROM lessons WHERE id = ?', [$l1]) === 2);
page($tr, "/manage/courses/$newCourse", 'Modules and lessons');
page($tr, "/manage/lessons/$l1/edit", 'Edit lesson');
page($tr, "/lessons/$l1", 'Rules');
check('Lesson text is escaped (no script injection)', str_contains($tr->body, '&lt;script&gt;') && !str_contains($tr->body, '<script>alert'));
page($tr, '/lessons/' . $l2['id'], 'escalation-form.pdf');
$tr->get('/lessons/' . $l2['id'] . '/file');
check('PDF is served to staff', $tr->status === 200 && str_starts_with($tr->body, '%PDF'));

page($tr, "/manage/courses/$newCourse/quizzes/new", 'New quiz');
$tr->post("/manage/courses/$newCourse/quizzes/new", ['title' => 'Escalation check', 'pass_mark' => 50, 'time_limit_min' => 5, 'max_attempts' => 2, 'show_answers' => 1], "/manage/courses/$newCourse/quizzes/new");
$qz = (int)DB::val("SELECT id FROM quizzes WHERE title = 'Escalation check'");
check('Quiz created', $qz > 0);
$tr->post("/manage/quizzes/$qz/questions/new", ['body' => 'Escalate threats?', 'type' => 'truefalse', 'points' => 1, 'tf_answer' => 'true'], "/manage/quizzes/$qz/questions/new");
$tr->post("/manage/quizzes/$qz/questions/new", ['body' => 'Pick one', 'type' => 'single', 'points' => 2, 'choice' => ['A', 'B', 'C', ''], 'correct' => [1]], "/manage/quizzes/$qz/questions/new");
$tr->post("/manage/quizzes/$qz/questions/new", ['body' => 'Pick many', 'type' => 'multiple', 'points' => 1, 'choice' => ['X', 'Y', 'Z'], 'correct' => [0, 2]], "/manage/quizzes/$qz/questions/new");
check('Three question types saved', (int)DB::val('SELECT COUNT(*) FROM questions WHERE quiz_id = ?', [$qz]) === 3);
$tr->post("/manage/quizzes/$qz/questions/new", ['body' => 'Invalid', 'type' => 'single', 'choice' => ['A', 'B'], 'correct' => []], "/manage/quizzes/$qz/questions/new");
check('Question with no correct answer is rejected', str_contains($tr->body, 'exactly one correct'));
$singleQ = (int)DB::val("SELECT id FROM questions WHERE body = 'Pick one'");
$choiceIdsBefore = array_column(DB::all('SELECT id FROM choices WHERE question_id = ? ORDER BY position', [$singleQ]), 'id');
$tr->post("/manage/questions/$singleQ/edit", ['body' => 'Pick one (edited)', 'type' => 'single', 'points' => 2, 'choice' => ['A', 'B2', 'C'], 'correct' => [1]], "/manage/questions/$singleQ/edit");
check('Editing a question keeps choice ids stable', array_column(DB::all('SELECT id FROM choices WHERE question_id = ? ORDER BY position', [$singleQ]), 'id') === $choiceIdsBefore);
page($tr, "/manage/quizzes/$qz", 'Pick one (edited)');

$tr->post("/manage/courses/$newCourse/edit", ['title' => 'Escalation Handling ዓለም', 'summary' => 'When and how to escalate.', 'category' => 'Customer Service', 'status' => 'published', 'certificate_enabled' => 1], "/manage/courses/$newCourse/edit");
check('Course published', DB::val('SELECT status FROM courses WHERE id = ?', [$newCourse]) === 'published');
$inbound = (int)DB::val("SELECT id FROM teams WHERE name = 'Inbound Customer Care'");
page($tr, "/manage/courses/$newCourse/enrolments", 'Assign this course');
$tr->post("/manage/courses/$newCourse/enrolments", ['team_ids' => [$inbound], 'auto_enrol_new' => 1, 'due_date' => date('Y-m-d', strtotime('+14 days'))], "/manage/courses/$newCourse/enrolments");
$members = (int)DB::val('SELECT COUNT(*) FROM users WHERE team_id = ? AND active = 1', [$inbound]);
check('Whole team enrolled with due date', (int)DB::val('SELECT COUNT(*) FROM enrolments WHERE course_id = ? AND due_date IS NOT NULL', [$newCourse]) === $members, "$members members");
check('Team set for automatic enrolment', (bool)DB::val('SELECT id FROM team_courses WHERE team_id = ? AND course_id = ?', [$inbound, $newCourse]));

echo "\nTrainer: reports\n";
page($tr, '/reports', 'By course');
page($tr, "/reports/courses/$cid", 'Learners');
page($tr, '/reports/quizzes/' . $quiz['id'], 'Question analysis');
page($tr, '/reports/users/' . $agentRow['id'], 'Quiz attempts');
page($tr, "/attempts/$attempt2/result", 'Review');
$tr->get('/reports/export?type=enrolments');
check('Progress CSV export', $tr->status === 200 && str_contains($tr->body, 'Progress %') && str_contains(implode("\n", $tr->headers), 'text/csv'));
$tr->get('/reports/export?type=attempts');
check('Quiz results CSV export', $tr->status === 200 && str_contains($tr->body, 'Percent'));
$tr->get('/admin/users');
check('Trainer cannot manage people (403)', $tr->status === 403);

// ---------------------------------------------------------------- team lead
echo "\nTeam lead: scoped reports\n";
$tl = new Client($base);
$tl->login('dawit.bekele@shaggar.test', 'Welcome@123');
page($tl, '/reports', 'By course');
$sales = (int)DB::val("SELECT id FROM teams WHERE name = 'Outbound Sales'");
$outsider = DB::one('SELECT id, name FROM users WHERE team_id = ? AND role = ? LIMIT 1', [$inbound, 'agent']);
$insider = DB::one('SELECT id, name FROM users WHERE team_id = ? AND role = ? LIMIT 1', [$sales, 'agent']);
check('Team lead sees own agents', str_contains($tl->body, e($insider['name'])));
check("Team lead does not see other teams' agents", !str_contains($tl->body, e($outsider['name'])));
$tl->get('/reports/users/' . $outsider['id']);
check('Team lead blocked from other team member (403)', $tl->status === 403);
$tl->get('/reports?team=' . $inbound);
check('Team lead blocked from other team filter (403)', $tl->status === 403);
page($tl, '/reports/users/' . $insider['id'], 'Courses');
$tl->get('/reports/export');
check('Team lead CSV only has own team', !str_contains($tl->body, $outsider['name']) && str_contains($tl->body, $insider['name']));
$tl->get('/manage/courses');
check('Team lead cannot manage courses (403)', $tl->status === 403);

// ---------------------------------------------------------------- admin
echo "\nAdmin: people and teams\n";
$ad = new Client($base);
$ad->login('admin@shaggar.test', 'Admin@12345');
page($ad, '/', 'Training at a glance');
page($ad, '/admin/users', 'People');
page($ad, '/admin/users?role=agent&status=all&q=a', 'People');
page($ad, '/admin/teams', 'Teams');
page($ad, '/admin/users/new', 'Add person');
page($ad, '/admin/teams/' . $inbound . '/edit', 'Members');
$ad->post('/admin/users/new', ['name' => 'New Hire', 'email' => 'new.hire@shaggar.test', 'role' => 'agent', 'team_id' => $inbound], '/admin/users/new');
$nh = DB::one("SELECT * FROM users WHERE email = 'new.hire@shaggar.test'");
check('Person created with temporary password', $nh && (int)$nh['must_change_password'] === 1 && preg_match('/Temporary password: (\S+)/', $ad->body, $pw) === 1);
check('New team member auto-enrolled in team courses', (int)DB::val('SELECT COUNT(*) FROM enrolments WHERE user_id = ?', [$nh['id']]) === (int)DB::val('SELECT COUNT(*) FROM team_courses WHERE team_id = ?', [$inbound]));
$ad->post('/admin/users/new', ['name' => 'Dup', 'email' => 'new.hire@shaggar.test', 'role' => 'agent'], '/admin/users/new');
check('Duplicate email rejected', str_contains($ad->body, 'already uses that email'));
$ad->post('/admin/users/' . DB::val("SELECT id FROM users WHERE email='admin@shaggar.test'") . '/edit', ['name' => 'System Admin', 'email' => 'admin@shaggar.test', 'role' => 'agent', 'active' => 1], '/admin/users');
check('Admin cannot demote themselves', str_contains($ad->body, 'cannot remove your own administrator role'));

$csv = tempnam(sys_get_temp_dir(), 'csv');
file_put_contents($csv, "\xEF\xBB\xBFname,email,role,team,campaign,employee_id,password\nሰላም ተስፋዬ,selam.t@shaggar.test,agent,Night Shift,Telecom,SHG-900,\nTigist Haile,tigist.haile@shaggar.test,agent,Outbound Sales,,SHG-901,\nBad Row,not-an-email,agent,,,,\n");
$ad->post('/admin/users/import', [], '/admin/users/import', true, ['csv' => [$csv, 'text/csv', 'people.csv']]);
check('CSV import: created, updated and skipped rows', str_contains($ad->body, '1 created, 1 updated, 1 skipped'), strip_tags(substr($ad->body, strpos($ad->body, 'flash-success') ?: 0, 200)));
check('CSV import keeps Amharic names and creates new teams', DB::val("SELECT name FROM users WHERE email = 'selam.t@shaggar.test'") === 'ሰላም ተስፋዬ' && DB::val("SELECT id FROM teams WHERE name = 'Night Shift'"));

$nhc = new Client($base);
$nhc->login('new.hire@shaggar.test', $pw[1] ?? '');
check('New person is forced to change password', str_contains($nhc->body, 'temporary password'));
$nhc->get('/courses', false);
check('…and cannot skip it', $nhc->status === 302 && str_ends_with($nhc->location, '/account/password'));
$nhc->post('/account/password', ['current' => $pw[1] ?? '', 'new' => 'MyOwnPass#1', 'confirm' => 'MyOwnPass#1'], '/account/password');
check('Password changed, dashboard reachable', str_contains($nhc->body, 'My learning'));

$ad->post("/admin/users/{$nh['id']}/edit", ['name' => 'New Hire', 'email' => 'new.hire@shaggar.test', 'role' => 'agent', 'team_id' => $inbound], "/admin/users/{$nh['id']}/edit");
$nhc->get('/');
check('Deactivated person is signed out', str_contains($nhc->body, 'Sign in'));

// Rate limiting
$rl = new Client($base);
for ($i = 0; $i < 6; $i++) {
    $rl->login('ratelimit@shaggar.test', 'nope');
}
check('Login rate limit after repeated failures', str_contains($rl->body, 'Too many failed attempts'));

// Course deletion clean-up
$ad->post("/manage/courses/$newCourse/delete", ['confirm_title' => 'wrong'], "/manage/courses/$newCourse/edit");
check('Course delete needs exact title', (bool)DB::val('SELECT id FROM courses WHERE id = ?', [$newCourse]));
$ad->post("/manage/courses/$newCourse/delete", ['confirm_title' => 'Escalation Handling ዓለም'], "/manage/courses/$newCourse/edit");
clearstatcache();
$gone = [!DB::val('SELECT id FROM courses WHERE id = ?', [$newCourse]), !DB::val('SELECT id FROM lessons WHERE id = ?', [$l2['id']]), !is_file(config('uploads_dir') . '/' . $l2['file_path'])];
check('Course deleted with its lessons and files', !in_array(false, $gone, true), json_encode($gone) . " HTTP {$ad->status}");

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
