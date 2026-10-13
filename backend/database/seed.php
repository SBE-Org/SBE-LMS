<?php
declare(strict_types=1);

/** Creates the first administrator account. */
function create_admin(string $name, string $email, string $password): int
{
    return DB::insert('users', [
        'name' => $name,
        'email' => strtolower($email),
        'password_hash' => password_hash($password, PASSWORD_DEFAULT),
        'role' => 'admin',
        'active' => 1,
        'must_change_password' => 0,
        'created_at' => now(),
    ]);
}

/**
 * Demo content: teams, staff, agents, four BPO training courses with quizzes,
 * and realistic progress so the reports have something to show.
 * Every demo person has the password "Welcome@123".
 */
function seed_demo(int $adminId): void
{
    mt_srand(2026);
    $pw = password_hash('Welcome@123', PASSWORD_DEFAULT);
    $ts = fn(int $daysAgo, int $hour = 10) => date('Y-m-d H:i:s', strtotime("-$daysAgo days $hour:00"));

    DB::tx(function () use ($adminId, $pw, $ts) {
        $mkUser = function (string $name, string $email, string $role, ?int $team, ?string $emp) use ($pw, $ts) {
            return DB::insert('users', [
                'name' => $name, 'email' => $email, 'password_hash' => $pw, 'role' => $role, 'team_id' => $team,
                'employee_id' => $emp, 'active' => 1, 'must_change_password' => 0, 'created_at' => $ts(60),
                'last_login_at' => $ts(mt_rand(0, 6), mt_rand(8, 17)),
            ]);
        };

        // ---- teams and people -------------------------------------------
        $teamDefs = [
            ['Inbound Customer Care', 'Telecom support line', 'Hana Tesfaye', 'hana.tesfaye'],
            ['Outbound Sales', 'Insurance & banking products', 'Dawit Bekele', 'dawit.bekele'],
            ['Back Office & Data', 'Data entry and verification', 'Meron Alemu', 'meron.alemu'],
        ];
        $mkUser('Selam Girma', 'trainer@shaggar.test', 'trainer', null, 'SHG-T01');
        $teams = [];
        foreach ($teamDefs as $i => [$tname, $campaign, $lead, $slug]) {
            $teamId = DB::insert('teams', ['name' => $tname, 'campaign' => $campaign, 'created_at' => $ts(60)]);
            $leadId = $mkUser($lead, "$slug@shaggar.test", 'team_lead', $teamId, sprintf('SHG-L%02d', $i + 1));
            DB::update('teams', ['lead_id' => $leadId], 'id = ?', [$teamId]);
            $teams[] = $teamId;
        }
        $agentNames = [
            ['Abebe Kebede', 0], ['Tigist Haile', 0], ['Yonas Tadesse', 0], ['Mahlet Assefa', 0], ['Biruk Getachew', 0],
            ['Lidya Mekonnen', 1], ['Kaleb Worku', 1], ['Rahel Negash', 1], ['Samuel Desta', 1],
            ['Hiwot Abera', 2], ['Natnael Fikre', 2], ['Bethlehem Yirga', 2],
        ];
        $agents = [];
        foreach ($agentNames as $i => [$n, $t]) {
            $email = strtolower(str_replace(' ', '.', $n)) . '@shaggar.test';
            $agents[] = ['id' => $mkUser($n, $email, 'agent', $teams[$t], sprintf('SHG-A%03d', $i + 1)), 'team' => $t];
        }

        // ---- courses ----------------------------------------------------
        $courses = demo_courses();
        $courseIds = [];
        foreach ($courses as $c) {
            $cid = DB::insert('courses', [
                'title' => $c['title'], 'summary' => $c['summary'], 'category' => $c['category'], 'status' => 'published',
                'self_enrol' => $c['self_enrol'], 'certificate_enabled' => 1, 'created_by' => $adminId,
                'created_at' => $ts(45), 'updated_at' => $ts(20),
            ]);
            foreach ($c['modules'] as $mi => [$mtitle, $lessons]) {
                $mid = DB::insert('modules', ['course_id' => $cid, 'title' => $mtitle, 'position' => $mi + 1]);
                foreach ($lessons as $li => $l) {
                    DB::insert('lessons', [
                        'module_id' => $mid, 'title' => $l[0], 'type' => $l[1], 'body' => $l[2],
                        'video_url' => $l[3] ?? null, 'duration_min' => $l[4] ?? 10, 'position' => $li + 1,
                    ]);
                }
            }
            $qz = $c['quiz'];
            $qid = DB::insert('quizzes', [
                'course_id' => $cid, 'title' => $qz['title'], 'description' => $qz['description'], 'pass_mark' => $qz['pass_mark'],
                'time_limit_min' => $qz['time_limit'], 'max_attempts' => $qz['max_attempts'], 'show_answers' => 1,
                'shuffle_questions' => 0, 'position' => 1,
            ]);
            foreach ($qz['questions'] as $qi => [$body, $type, $options, $explanation]) {
                $questionId = DB::insert('questions', ['quiz_id' => $qid, 'body' => $body, 'type' => $type, 'points' => 1, 'explanation' => $explanation, 'position' => $qi + 1]);
                foreach ($options as $oi => [$text, $correct]) {
                    DB::insert('choices', ['question_id' => $questionId, 'body' => $text, 'is_correct' => $correct ? 1 : 0, 'position' => $oi + 1]);
                }
            }
            $courseIds[] = $cid;
        }

        // ---- assignments ------------------------------------------------
        // Onboarding + data protection: every team. Call handling: inbound. Sales: outbound.
        $assign = [[0, [0, 1, 2], 30], [2, [0, 1, 2], 21], [1, [0], 30], [3, [1], 30]];
        foreach ($assign as [$ci, $teamIdx, $dueDays]) {
            foreach ($teamIdx as $t) {
                DB::insert('team_courses', ['team_id' => $teams[$t], 'course_id' => $courseIds[$ci], 'due_days' => $dueDays, 'assigned_by' => $adminId, 'created_at' => $ts(40)]);
            }
        }
        foreach ($agents as $a) {
            foreach ($assign as [$ci, $teamIdx, $dueDays]) {
                if (in_array($a['team'], $teamIdx, true)) {
                    $enrolDay = mt_rand(20, 40);
                    DB::insert('enrolments', [
                        'user_id' => $a['id'], 'course_id' => $courseIds[$ci], 'assigned_by' => $adminId,
                        'due_date' => date('Y-m-d', strtotime('-' . $enrolDay . ' days +' . $dueDays . ' days')),
                        'enrolled_at' => $ts($enrolDay),
                    ]);
                }
            }
        }
    });

    // ---- simulated learning activity (outside the transaction: uses completion logic) ----
    $enrolments = DB::all("SELECT e.user_id, e.course_id FROM enrolments e JOIN users u ON u.id = e.user_id WHERE u.role = 'agent'");
    foreach ($enrolments as $e) {
        $uid = (int)$e['user_id'];
        $cid = (int)$e['course_id'];
        $lessons = array_map('intval', array_column(DB::all(
            'SELECT l.id FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = ? ORDER BY m.position, l.position',
            [$cid]
        ), 'id'));
        $roll = mt_rand(1, 100);
        $fraction = $roll <= 15 ? 0 : ($roll <= 40 ? mt_rand(20, 80) / 100 : 1);
        $doneCount = (int)floor(count($lessons) * $fraction);
        foreach (array_slice($lessons, 0, $doneCount) as $k => $lid) {
            DB::insert('lesson_progress', ['user_id' => $uid, 'lesson_id' => $lid, 'completed_at' => $ts(max(1, 18 - $k), 11)], true);
        }
        if ($fraction === 1.0 || $fraction == 1) {
            foreach (DB::all('SELECT * FROM quizzes WHERE course_id = ?', [$cid]) as $quiz) {
                $tries = mt_rand(1, 2);
                for ($t = 0; $t < $tries; $t++) {
                    simulate_attempt($uid, $quiz, $t === $tries - 1 ? 0.85 : 0.55, $ts(10 - $t * 3, 14));
                }
            }
        }
        Progress::checkCompletion($uid, $cid);
    }
    // Completion dates should look historical rather than "now"
    foreach (DB::all('SELECT id FROM enrolments WHERE completed_at IS NOT NULL') as $i => $r) {
        DB::update('enrolments', ['completed_at' => $ts(2 + $i % 9, 15)], 'id = ?', [$r['id']]);
    }
    foreach (DB::all('SELECT id FROM certificates') as $i => $r) {
        DB::update('certificates', ['issued_at' => $ts(2 + $i % 9, 15)], 'id = ?', [$r['id']]);
    }
}

/** Records a submitted attempt where each answer is right with the given probability. */
function simulate_attempt(int $userId, array $quiz, float $skill, string $when): void
{
    $questions = DB::all('SELECT * FROM questions WHERE quiz_id = ? ORDER BY position', [$quiz['id']]);
    $attemptId = DB::insert('quiz_attempts', [
        'user_id' => $userId, 'quiz_id' => $quiz['id'], 'status' => 'in_progress',
        'question_order' => json_encode(array_map(fn($q) => (int)$q['id'], $questions)),
        'started_at' => $when,
    ]);
    $score = $max = 0;
    foreach ($questions as $q) {
        $choices = DB::all('SELECT * FROM choices WHERE question_id = ? ORDER BY position', [$q['id']]);
        $right = array_map(fn($c) => (int)$c['id'], array_filter($choices, fn($c) => (int)$c['is_correct'] === 1));
        $wrong = array_map(fn($c) => (int)$c['id'], array_filter($choices, fn($c) => (int)$c['is_correct'] === 0));
        $ok = mt_rand(1, 100) <= $skill * 100 || !$wrong;
        $sel = $ok ? array_values($right) : [$wrong[array_rand($wrong)]];
        sort($sel);
        $max += (int)$q['points'];
        $score += $ok ? (int)$q['points'] : 0;
        DB::insert('attempt_answers', ['attempt_id' => $attemptId, 'question_id' => $q['id'], 'selected' => implode(',', $sel), 'correct' => $ok ? 1 : 0, 'points' => $ok ? (int)$q['points'] : 0]);
    }
    $pct = $max ? (int)floor($score * 100 / $max) : 0;
    DB::update('quiz_attempts', [
        'status' => 'submitted', 'submitted_at' => date('Y-m-d H:i:s', strtotime($when) + 600),
        'score' => $score, 'max_score' => $max, 'percent' => $pct, 'passed' => $pct >= (int)$quiz['pass_mark'] ? 1 : 0,
    ], 'id = ?', [$attemptId]);
}

/** Course content. Lesson tuple: [title, type, body, video_url, minutes] */
function demo_courses(): array
{
    return [
        [
            'title' => 'New Agent Onboarding',
            'category' => 'Onboarding',
            'self_enrol' => 0,
            'summary' => 'Everything a new agent needs in the first week at Shaggar BPO: who we are, how a shift works, our service standards and the tools you will use every day.',
            'modules' => [
                ['Welcome to Shaggar BPO', [
                    ['Who we are and what we do', 'text', "# Welcome to the team\n\nShaggar BPO Enterprise delivers customer contact, sales and back-office services for clients across Ethiopia and the region.\n\nAs an agent, **you are the voice of our clients**. Every conversation shapes how a customer feels about their brand.\n\n## What you will learn this week\n- How a shift is organised and what is expected of you\n- Our service standards and quality scoring\n- The systems you will use on every call\n\n> Tip: keep this course open during your first shifts and come back to it whenever you need a reminder.", null, 8],
                    ['Your shift: schedules, breaks and adherence', 'text', "# How a shift works\n\nOur clients plan staffing to the minute, so **schedule adherence** matters.\n\n1. Log in to your workstation 10 minutes before your shift.\n2. Set your status to *Available* exactly at your start time.\n3. Take breaks only at your scheduled times.\n4. Use the correct status code for every non-call activity (training, coaching, after-call work).\n\n## Adherence target\nWe aim for **95% adherence** or better. Your team lead reviews it every week.\n\n## If you are late or sick\nCall your team lead **before** your shift starts. Do not message colleagues instead.", null, 10],
                ]],
                ['Service standards', [
                    ['The five service standards', 'text', "# Our five service standards\n\n- **Greet** — use the approved opening within 3 seconds.\n- **Listen** — let the customer finish; take notes.\n- **Resolve** — aim to fix the issue on the first contact.\n- **Confirm** — summarise what you did and the next steps.\n- **Close** — use the approved closing and offer further help.\n\nQuality analysts score a sample of your calls against these five standards every week.", null, 12],
                    ['Quality scoring explained', 'text', "# How call quality is measured\n\n> Trainers: edit this lesson, change its type to Video and paste your own quality briefing video link or upload the recording.\n\n## Key points\n- Each call is scored out of 100.\n- **Critical errors** (for example, sharing data with the wrong person) mean a score of zero for that call.\n- Your monthly quality target is **85%**.", null, 6],
                ]],
                ['Systems and tools', [
                    ['CRM basics: finding and updating a customer record', 'text', "# Working in the CRM\n\n1. Search by phone number first, then by account number.\n2. **Verify identity** before discussing any account details (see the Data Protection course).\n3. Log every contact with a clear note: reason, action taken, outcome.\n\n## Good notes are\n- Short and factual\n- Free of personal opinions\n- Written so the next agent can continue without asking the customer again", null, 10],
                ]],
            ],
            'quiz' => [
                'title' => 'Onboarding check',
                'description' => 'Ten minutes, eight questions. You need 70% to pass. You can retake it.',
                'pass_mark' => 70, 'time_limit' => 10, 'max_attempts' => 0,
                'questions' => [
                    ['How early should you log in before your shift starts?', 'single', [['Exactly at the start time', false], ['10 minutes before', true], ['30 minutes before', false]], 'Logging in 10 minutes early lets you set up your tools and be Available on time.'],
                    ['What is our schedule adherence target?', 'single', [['80%', false], ['90%', false], ['95%', true], ['100%', false]], 'We aim for 95% adherence or better.'],
                    ['If you will be late, you should message a colleague to tell the team lead.', 'truefalse', [['True', false], ['False', true]], 'Always call your team lead directly, before your shift starts.'],
                    ['Which of these are part of our five service standards? (Select all that apply)', 'multiple', [['Greet', true], ['Upsell', false], ['Resolve', true], ['Confirm', true]], 'The five standards are Greet, Listen, Resolve, Confirm and Close.'],
                    ['What happens to a call score when there is a critical error?', 'single', [['It loses 10 points', false], ['It becomes zero', true], ['Nothing, it is only noted', false]], 'Critical errors such as data disclosure to the wrong person zero the call.'],
                    ['What is the monthly quality target?', 'single', [['75%', false], ['85%', true], ['95%', false]], 'The monthly quality target is 85%.'],
                    ['What should you do before discussing account details?', 'single', [['Verify the caller\'s identity', true], ['Read the last note aloud', false], ['Transfer to a supervisor', false]], 'Identity verification always comes first.'],
                    ['Good CRM notes include your personal opinion of the customer.', 'truefalse', [['True', false], ['False', true]], 'Notes should be short, factual and free of opinions.'],
                ],
            ],
        ],
        [
            'title' => 'Call Handling Excellence',
            'category' => 'Customer Service',
            'self_enrol' => 1,
            'summary' => 'Practical techniques for confident, efficient calls: openings, active listening, handling angry customers, hold and transfer etiquette, and strong closings.',
            'modules' => [
                ['Opening and listening', [
                    ['The perfect opening', 'text', "# The first 10 seconds\n\nA strong opening sets the tone for the whole call.\n\n**Approved opening:** “Thank you for calling [client name], my name is [your name]. How may I help you today?”\n\n- Smile — it can be heard in your voice.\n- Speak slowly and clearly.\n- Use the customer's name once you have it.", null, 6],
                    ['Active listening techniques', 'text', "# Active listening\n\n- **Acknowledge**: “I understand.” “I see.”\n- **Paraphrase**: repeat the issue in your own words to confirm.\n- **Ask open questions**: “Can you tell me more about…?”\n- **Avoid interrupting**, even when you already know the answer.", null, 8],
                ]],
                ['Difficult situations', [
                    ['Handling an angry customer: the HEAT method', 'text', "# HEAT\n\n1. **Hear** them out without interrupting.\n2. **Empathise**: “I'm sorry this has happened, I understand how frustrating it is.”\n3. **Apologise** for the experience (not necessarily for fault).\n4. **Take action** and explain exactly what you will do.\n\n> Never take anger personally. The customer is upset with the situation, not with you.", null, 12],
                    ['Hold and transfer etiquette', 'text', "# Hold and transfer\n\n- Always **ask permission** before placing a customer on hold.\n- Tell them how long it will take; check back every **60 seconds**.\n- For a transfer, explain why and brief the receiving agent (a **warm transfer**) so the customer does not repeat themselves.", null, 7],
                ]],
            ],
            'quiz' => [
                'title' => 'Call handling assessment',
                'description' => 'Scenario-based questions on call handling. Pass mark 75%. Two attempts.',
                'pass_mark' => 75, 'time_limit' => 15, 'max_attempts' => 2,
                'questions' => [
                    ['What does the “E” in HEAT stand for?', 'single', [['Escalate', false], ['Empathise', true], ['Explain', false]], 'HEAT = Hear, Empathise, Apologise, Take action.'],
                    ['How often should you check back with a customer on hold?', 'single', [['Every 30 seconds', false], ['Every 60 seconds', true], ['Every 3 minutes', false]], 'Check back every 60 seconds.'],
                    ['A warm transfer means briefing the receiving agent before connecting the customer.', 'truefalse', [['True', true], ['False', false]], 'Warm transfers stop customers having to repeat themselves.'],
                    ['Which are active listening techniques? (Select all that apply)', 'multiple', [['Paraphrasing', true], ['Interrupting to save time', false], ['Asking open questions', true], ['Acknowledging', true]], 'Interrupting is the opposite of active listening.'],
                    ['When should you use the customer\'s name?', 'single', [['Never', false], ['Once you have it', true], ['Only at the end', false]], 'Using the name builds rapport.'],
                ],
            ],
        ],
        [
            'title' => 'Data Protection & Information Security',
            'category' => 'Compliance',
            'self_enrol' => 0,
            'summary' => 'Mandatory compliance training: protecting customer data, verifying identity, clean-desk rules and spotting social engineering and phishing.',
            'modules' => [
                ['Protecting customer data', [
                    ['Why data protection matters', 'text', "# Why it matters\n\nOur clients trust us with their customers' personal data. A single breach can cost a contract and harm real people.\n\n## Personal data includes\n- Names, phone numbers and addresses\n- ID and account numbers\n- Payment information\n- Call recordings", null, 8],
                    ['Identity verification (ID&V)', 'text', "# Verify every caller\n\nBefore discussing **any** account information, the caller must pass ID&V:\n\n1. Full name\n2. Account or phone number\n3. **Two** security answers from the approved list\n\nIf the caller fails, you may only give general information. Never hint at the correct answers.", null, 10],
                ]],
                ['Security at work', [
                    ['Clean desk and device rules', 'text', "# Clean desk\n\n- No phones, paper or pens at your workstation on secure floors.\n- **Lock your screen** (Windows + L) whenever you step away.\n- Never write passwords down.\n- Report a lost access card immediately.", null, 6],
                    ['Spotting phishing and social engineering', 'text', "# Red flags\n\n- Urgency: “Do this now or the account will be closed.”\n- Requests for passwords or one-time codes — **we never ask for these**.\n- Callers claiming to be IT or a manager and asking you to bypass a process.\n\nIf in doubt, stop and escalate to your team lead.", null, 9],
                ]],
            ],
            'quiz' => [
                'title' => 'Compliance certification test',
                'description' => 'Mandatory. Pass mark 80%. Three attempts.',
                'pass_mark' => 80, 'time_limit' => 12, 'max_attempts' => 3,
                'questions' => [
                    ['How many security answers must a caller give to pass ID&V?', 'single', [['One', false], ['Two', true], ['Three', false]], 'Name, account/phone number, plus two security answers.'],
                    ['Which of these is personal data? (Select all that apply)', 'multiple', [['Phone number', true], ['Call recording', true], ['The weather today', false], ['Account number', true]], 'Recordings and numbers that identify a person are personal data.'],
                    ['It is fine to keep your mobile phone at your desk on a secure floor if it is switched off.', 'truefalse', [['True', false], ['False', true]], 'No phones at all at workstations on secure floors.'],
                    ['A caller says they are from IT and asks for your password to fix your account. What do you do?', 'single', [['Give it, IT needs it', false], ['Refuse and report it to your team lead', true], ['Give it only if they know your name', false]], 'We never ask for passwords. This is social engineering.'],
                    ['What is the keyboard shortcut to lock your screen on Windows?', 'single', [['Ctrl + L', false], ['Windows + L', true], ['Alt + F4', false]], 'Windows + L locks the screen immediately.'],
                ],
            ],
        ],
        [
            'title' => 'Outbound Sales Techniques',
            'category' => 'Sales',
            'self_enrol' => 1,
            'summary' => 'Structured outbound calling: the call flow, discovering needs, presenting benefits, handling objections and closing ethically.',
            'modules' => [
                ['The sales call', [
                    ['Outbound call flow', 'text', "# Call flow\n\n1. **Introduce** yourself and the company; confirm you are speaking to the right person.\n2. **Permission**: “Is now a good time for two minutes?”\n3. **Discover** needs with open questions.\n4. **Present** benefits that match those needs.\n5. **Handle objections**.\n6. **Close** and confirm next steps.", null, 8],
                    ['Features vs benefits', 'text', "# Sell benefits\n\nA **feature** is what a product has. A **benefit** is what it does for the customer.\n\n- Feature: “The plan includes 10 GB of data.”\n- Benefit: “You can video-call your family every week without worrying about running out.”", null, 7],
                ]],
                ['Objections and closing', [
                    ['Handling objections: LAER', 'text', "# LAER\n\n- **Listen** fully\n- **Acknowledge** the concern\n- **Explore** with a question\n- **Respond** with a relevant benefit\n\nCommon objections: price, timing, “I need to ask my family”.", null, 10],
                    ['Ethical selling and compliance', 'text', "# Sell ethically\n\n- Never pressure or mislead.\n- State prices and terms clearly.\n- Respect “no” and do-not-call requests — record them in the CRM immediately.", null, 6],
                ]],
            ],
            'quiz' => [
                'title' => 'Sales skills quiz',
                'description' => 'Pass mark 70%. Unlimited attempts.',
                'pass_mark' => 70, 'time_limit' => null, 'max_attempts' => 0,
                'questions' => [
                    ['What comes right after introducing yourself on an outbound call?', 'single', [['Present the offer', false], ['Ask permission to continue', true], ['Close', false]], 'Always ask if now is a good time.'],
                    ['“You can video-call your family every week” is a…', 'single', [['Feature', false], ['Benefit', true]], 'It describes what the product does for the customer.'],
                    ['In LAER, what does the “E” stand for?', 'single', [['Explore', true], ['Explain', false], ['Escalate', false]], 'Listen, Acknowledge, Explore, Respond.'],
                    ['A do-not-call request can be recorded at the end of your shift.', 'truefalse', [['True', false], ['False', true]], 'Record it in the CRM immediately.'],
                ],
            ],
        ],
    ];
}
