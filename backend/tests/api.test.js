/**
 * End-to-end API test: drives the running app over HTTP as every role,
 * against a throw-away MongoDB database that is dropped afterwards.
 *
 *   npm test                                   (uses MONGODB_URI + "_test" database)
 *   MONGODB_TEST_URI=mongodb://127.0.0.1:27017/shaggar_lms_test npm test
 */
process.env.NODE_ENV = 'test';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
process.env.LOGIN_MAX_ATTEMPTS = '5';

const { config } = await import('../src/config.js');
const mongoose = (await import('mongoose')).default;
const { connectDB, disconnectDB } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const M = await import('../src/models/index.js');

const testUri = process.env.MONGODB_TEST_URI || config.mongoUri.replace(/\/([^/?]+)(\?|$)/, '/$1_test$2');
if (!/test/i.test(testUri)) {
  console.error(`Refusing to run: the test database name must contain "test" (${testUri}).`);
  process.exit(1);
}

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? `  [${detail}]` : ''}`);
  }
};

await connectDB(testUri);
await mongoose.connection.dropDatabase();
await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes())); // recreate indexes after the drop
const server = createApp().listen(0);
const base = `http://127.0.0.1:${server.address().port}/api`;

/** Minimal client that remembers its sign-in token. */
class Client {
  token = '';
  async req(method, path, body, raw = false) {
    const headers = {};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    let payload = body;
    if (body !== undefined && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(base + path, { method, headers, body: payload });
    const text = await res.text();
    let json = {};
    try {
      json = JSON.parse(text);
    } catch {
      /* CSV or file */
    }
    return { status: res.status, json, text, headers: res.headers, raw };
  }
  get(p) { return this.req('GET', p); }
  post(p, b = {}) { return this.req('POST', p, b); }
  put(p, b = {}) { return this.req('PUT', p, b); }
  del(p, b) { return this.req('DELETE', p, b); }
  async login(email, password) {
    const r = await this.post('/auth/login', { email, password });
    if (r.json.token) this.token = r.json.token;
    return r;
  }
}

try {
  // ---------------------------------------------------------------- install
  console.log('Install');
  const anon = new Client();
  let r = await anon.get('/meta');
  check('Fresh database reports not installed', r.json.installed === false);
  r = await anon.post('/install', { name: 'System Admin', email: 'admin@shaggar.test', password: 'Admin@12345', demo: true });
  check('Installer creates admin and demo data', r.status === 201 && !!r.json.token, `HTTP ${r.status} ${r.json.error || ''}`);
  r = await anon.post('/install', { name: 'X', email: 'x@shaggar.test', password: 'Admin@12345' });
  check('Installer is closed once installed', r.status === 404);
  check('Demo data: 22 people + admin, 4 courses, 3 departments',
    (await M.User.countDocuments()) === 23 && (await M.Course.countDocuments()) === 4 && (await M.Department.countDocuments()) === 3);
  check('Demo students are approved; demo applicants are pending', (await M.User.countDocuments({ role: 'agent', 'registration.status': 'approved' })) === 12
    && (await M.User.countDocuments({ 'registration.status': { $in: ['pending', 'correction_requested'] } })) === 3);
  check('Demo data produced certificates', (await M.Certificate.countDocuments()) > 0);

  // ---------------------------------------------------------------- public
  console.log('\nPublic');
  const cert = await M.Certificate.findOne();
  r = await anon.get(`/verify?code=${cert.code}`);
  check('Verify a real certificate', r.json.valid === true);
  r = await anon.get('/verify?code=SHG-FAKE');
  check('Verify a fake certificate', r.json.valid === false);
  r = await anon.get('/dashboard');
  check('Dashboard needs sign-in (401)', r.status === 401);
  r = await anon.login('abebe.kebede@shaggar.test', 'wrong-password');
  check('Wrong password is rejected', r.status === 401 && /do not match/.test(r.json.error));
  r = await anon.get('/no-such-route');
  check('Unknown API route is 404', r.status === 404);

  // ---------------------------------------------------------------- agent
  console.log('\nAgent journey');
  const unfinished = await M.Enrolment.findOne({ completedAt: null }).populate('user');
  const agentUser = await M.User.findOne({ _id: unfinished.user._id, role: 'agent' }) || unfinished.user;
  const agent = new Client();
  r = await agent.login(agentUser.email, 'Welcome@123');
  check('Agent signs in', r.status === 200 && r.json.user.role === agentUser.role, agentUser.email);
  r = await agent.get('/dashboard');
  check('Agent dashboard loads', r.status === 200 && Array.isArray(r.json.active));
  r = await agent.get('/courses');
  check('Catalog loads', r.status === 200 && r.json.courses.length > 0);
  const cid = String(unfinished.course);
  r = await agent.get(`/courses/${cid}`);
  check('Course page loads', r.status === 200 && r.json.outline.lessons.length > 0);
  const lessons = r.json.outline.lessons.map((l) => String(l._id));
  r = await agent.get(`/lessons/${lessons[0]}`);
  check('Lesson page loads', r.status === 200 && r.json.lesson.title);
  for (const lid of lessons) await agent.post(`/lessons/${lid}/complete`, {});
  const done = await M.LessonProgress.countDocuments({ user: agentUser._id, course: cid });
  check('All lessons marked complete', done === lessons.length, `${done}/${lessons.length}`);

  const quiz = await M.Quiz.findOne({ course: cid });
  await M.QuizAttempt.deleteMany({ user: agentUser._id, quiz: quiz._id });
  r = await agent.get(`/quizzes/${quiz._id}`);
  check('Quiz intro loads', r.status === 200 && r.json.questionCount > 0);
  r = await agent.post(`/quizzes/${quiz._id}/start`);
  const attemptId = r.json.attemptId;
  check('Quiz starts', !!attemptId, `HTTP ${r.status} ${r.json.error || ''}`);
  r = await agent.get(`/attempts/${attemptId}`);
  check('Attempt shows questions without correct answers', r.json.questions?.length > 0 && r.json.questions.every((q) => q.choices.every((c) => c.isCorrect === undefined)));

  const questions = await M.Question.find({ quiz: quiz._id });
  const wrong = Object.fromEntries(questions.map((q) => [String(q._id), [String(q.choices.find((c) => !c.isCorrect)._id)]]));
  await agent.post(`/attempts/${attemptId}`, { answers: wrong });
  let a = await M.QuizAttempt.findById(attemptId);
  check('Wrong answers → 0% and not passed', a.status === 'submitted' && a.percent === 0 && !a.passed);
  r = await agent.get(`/attempts/${attemptId}/result`);
  check('Failed attempt shows only the score: no questions or answers sent', r.status === 200 && r.json.reviewHidden === true && r.json.questions.length === 0 && Object.keys(r.json.answers).length === 0);
  check('Failed attempt offers another try while attempts remain', r.json.canRetry === true);
  await agent.post(`/attempts/${attemptId}`, { answers: {} });
  a = await M.QuizAttempt.findById(attemptId);
  check('Re-submitting a graded attempt changes nothing', a.answers.length === questions.length && a.percent === 0);

  r = await agent.post(`/quizzes/${quiz._id}/start`);
  const attempt2 = r.json.attemptId;
  const right = Object.fromEntries(questions.map((q) => [String(q._id), q.choices.filter((c) => c.isCorrect).map((c) => String(c._id))]));
  await agent.post(`/attempts/${attempt2}`, { answers: right });
  r = await agent.get(`/attempts/${attempt2}/result`);
  check('Correct answers → passed with 100%', r.json.attempt?.passed === true && r.json.attempt.percent === 100);
  check('Passed attempt includes the question review', r.json.reviewHidden === false && r.json.questions.length === questions.length);
  const enrol = await M.Enrolment.findOne({ user: agentUser._id, course: cid });
  check('Course marked complete', !!enrol.completedAt);

  // Timed quiz: answers are saved as the learner goes; when the time runs out the attempt is closed with them
  const saved = { timeLimitMin: quiz.timeLimitMin, maxAttempts: quiz.maxAttempts };
  await M.Quiz.updateOne({ _id: quiz._id }, { timeLimitMin: 1, maxAttempts: 0 });
  r = await agent.post(`/quizzes/${quiz._id}/start`);
  const attempt3 = r.json.attemptId;
  r = await agent.put(`/attempts/${attempt3}/draft`, { answers: { ...right, nope: ['x'] } });
  check('Answers are saved while the quiz is open', r.json.status === 'saved');
  r = await agent.get(`/attempts/${attempt3}`);
  check('Saved answers come back after a reload', Object.keys(r.json.draft || {}).length === questions.length && !('nope' in r.json.draft));
  await M.QuizAttempt.updateOne({ _id: attempt3 }, { startedAt: new Date(Date.now() - 10 * 60000) }); // the time ran out long ago
  r = await agent.get(`/quizzes/${quiz._id}`);
  a = await M.QuizAttempt.findById(attempt3);
  check('Expired attempt is closed with the saved answers', a.status === 'submitted' && a.percent === 100 && !r.json.open);
  await M.QuizAttempt.deleteOne({ _id: attempt3 });
  await M.Quiz.updateOne({ _id: quiz._id }, saved);
  const myCert = await M.Certificate.findOne({ user: agentUser._id, course: cid });
  check('Certificate issued', !!myCert);
  r = await agent.get(`/certificates/${myCert.code}`);
  check('Own certificate opens', r.status === 200 && r.json.certificate.learnerName === agentUser.name);

  r = await agent.get('/manage/courses');
  check('Agent cannot open course management (403)', r.status === 403);
  r = await agent.get('/admin/users');
  check('Agent cannot open people admin (403)', r.status === 403);
  r = await agent.get('/reports');
  check('Agent cannot open reports (403)', r.status === 403);
  const other = await M.QuizAttempt.findOne({ user: { $ne: agentUser._id }, status: 'submitted' });
  r = await agent.get(`/attempts/${other._id}/result`);
  check("Agent cannot see another person's answers (403)", r.status === 403);
  const otherCert = await M.Certificate.findOne({ user: { $ne: agentUser._id } });
  r = await agent.get(`/certificates/${otherCert.code}`);
  check("Agent cannot open another person's certificate (403)", r.status === 403);
  const mine = (await M.Enrolment.find({ user: agentUser._id })).map((e) => String(e.course));
  const closed = (await M.Course.find({ selfEnrol: false })).find((c) => !mine.includes(String(c._id)));
  if (closed) {
    r = await agent.get(`/courses/${closed._id}`);
    check('Agent cannot open a course they are not enrolled in (403)', r.status === 403);
  }
  const open = (await M.Course.find({ selfEnrol: true, status: 'published' })).find((c) => !mine.includes(String(c._id)));
  if (open) {
    await agent.post(`/courses/${open._id}/enrol`);
    check('Agent can join an open course', !!(await M.Enrolment.exists({ user: agentUser._id, course: open._id })));
  }

  // ---------------------------------------------------------------- trainer
  console.log('\nTrainer: build a course');
  const tr = new Client();
  await tr.login('trainer@shaggar.test', 'Welcome@123');
  r = await tr.post('/manage/courses', { title: 'Escalation Handling ዓለም', summary: 'When and how to escalate.', category: 'Customer Service', status: 'draft', certificateEnabled: true });
  const newCourse = r.json.course?._id;
  check('Course created (with Amharic text)', r.status === 201 && r.json.course.title === 'Escalation Handling ዓለም');
  r = await tr.get(`/manage/courses/${newCourse}`);
  const mod = r.json.modules[0]._id;
  await tr.post(`/manage/courses/${newCourse}/modules`, { title: 'Module 2: Tools' });
  check('Module added', (await M.Module.countDocuments({ course: newCourse })) === 2);

  const lessonForm = (fields, file) => {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => fd.append(k, String(v)));
    if (file) fd.append('file', new Blob([file.content], { type: file.type }), file.name);
    return fd;
  };
  r = await tr.post(`/manage/modules/${mod}/lessons`, lessonForm({ title: 'When to escalate', type: 'text', moduleId: mod, body: '# Rules\n- **Always** escalate threats\n<script>alert(1)</script>', durationMin: 5 }));
  const l1 = r.json.lesson?._id;
  check('Text lesson added', r.status === 201 && !!l1, r.json.error);
  const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';
  r = await tr.post(`/manage/modules/${mod}/lessons`, lessonForm({ title: 'Escalation form (PDF)', type: 'file', moduleId: mod }, { content: pdf, type: 'application/pdf', name: 'escalation-form.pdf' }));
  const l2 = r.json.lesson;
  check('File lesson uploaded to GridFS', r.status === 201 && l2.file?.name === 'escalation-form.pdf' && !!l2.file.id, r.json.error);
  r = await tr.post(`/manage/modules/${mod}/lessons`, lessonForm({ title: 'Bad file', type: 'file', moduleId: mod }, { content: 'MZ', type: 'application/octet-stream', name: 'virus.exe' }));
  check('Disallowed file type is rejected', r.status === 422 && /not allowed/.test(r.json.error) && !(await M.Lesson.exists({ title: 'Bad file' })));
  r = await tr.post(`/manage/modules/${mod}/lessons`, lessonForm({ title: 'Video lesson', type: 'video', moduleId: mod, videoUrl: 'https://youtu.be/aaaaaaaaaaa' }));
  check('Video lesson added', r.status === 201);
  r = await tr.post(`/manage/modules/${mod}/lessons`, lessonForm({ title: 'Bad video', type: 'video', moduleId: mod, videoUrl: 'https://example.com/page' }));
  check('Unsupported video link is rejected', r.status === 422);
  // Audio lessons (upload or link) and lesson links
  r = await tr.post(`/manage/modules/${mod}/lessons`, lessonForm({ title: 'Call recording', type: 'audio', moduleId: mod }, { content: 'ID3', type: 'audio/mpeg', name: 'call.mp3' }));
  const la = r.json.lesson;
  check('Audio lesson with an uploaded file', r.status === 201 && la.type === 'audio' && la.file?.name === 'call.mp3', r.json.error);
  r = await tr.post(`/manage/modules/${mod}/lessons`, lessonForm({ title: 'Podcast', type: 'audio', moduleId: mod, audioUrl: 'https://example.com/ep1.mp3',
    links: JSON.stringify([{ title: 'Script', url: 'example.com/script' }, { title: '', url: 'mailto:help@shaggar.test' }, { title: '', url: '' }]) }));
  const lp = r.json.lesson;
  check('Audio link and lesson links saved', r.status === 201 && lp.audioUrl === 'https://example.com/ep1.mp3' && lp.links.length === 2 && lp.links[0].url === 'https://example.com/script' && lp.links[1].title === 'mailto:help@shaggar.test', r.json.error);
  r = await tr.post(`/manage/modules/${mod}/lessons`, lessonForm({ title: 'No audio', type: 'audio', moduleId: mod }));
  check('Audio lesson without audio is rejected', r.status === 422);
  r = await tr.post(`/manage/modules/${mod}/lessons`, lessonForm({ title: 'Audio but PDF', type: 'audio', moduleId: mod }, { content: pdf, type: 'application/pdf', name: 'x.pdf' }));
  check('Audio lesson with a non-audio file is rejected', r.status === 422);
  r = await tr.post(`/manage/modules/${mod}/lessons`, lessonForm({ title: 'Bad link', type: 'text', moduleId: mod, links: JSON.stringify([{ title: 'x', url: 'javascript:alert(1)' }]) }));
  check('Unsafe lesson link is rejected', r.status === 422 && !(await M.Lesson.exists({ title: 'Bad link' })));
  await tr.del(`/manage/lessons/${la._id}`);
  await tr.del(`/manage/lessons/${lp._id}`);
  await tr.post(`/manage/lessons/${l1}/move`, { dir: 'down' });
  check('Lesson reordered', (await M.Lesson.findById(l1)).position === 2);
  r = await tr.get(`/lessons/${l2._id}`);
  check('Staff can preview a lesson and get a file link', r.status === 200 && /token=/.test(r.json.lesson.fileUrl));
  const fileRes = await fetch(base.replace(/\/api$/, '') + r.json.lesson.fileUrl);
  const fileText = await fileRes.text();
  check('PDF is served from GridFS', fileRes.status === 200 && fileText.startsWith('%PDF'));
  const rangeRes = await fetch(base.replace(/\/api$/, '') + r.json.lesson.fileUrl, { headers: { Range: 'bytes=0-3' } });
  check('File supports range requests (video seeking)', rangeRes.status === 206 && (await rangeRes.text()) === '%PDF');
  const badLink = await fetch(`${base}/lessons/${l2._id}/file?token=nope`);
  check('File link without a valid token is refused', badLink.status === 401);

  r = await tr.post(`/manage/courses/${newCourse}/quizzes`, { title: 'Escalation check', passMark: 50, timeLimitMin: 5, maxAttempts: 2, showAnswers: true });
  const qz = r.json.quiz?._id;
  check('Quiz created', r.status === 201);
  await tr.post(`/manage/quizzes/${qz}/questions`, { body: 'Escalate threats?', type: 'truefalse', points: 1, tfAnswer: 'true' });
  await tr.post(`/manage/quizzes/${qz}/questions`, { body: 'Pick one', type: 'single', points: 2, choices: [{ body: 'A' }, { body: 'B', isCorrect: true }, { body: 'C' }, { body: '' }] });
  await tr.post(`/manage/quizzes/${qz}/questions`, { body: 'Pick many', type: 'multiple', points: 1, choices: [{ body: 'X', isCorrect: true }, { body: 'Y' }, { body: 'Z', isCorrect: true }] });
  check('Three question types saved', (await M.Question.countDocuments({ quiz: qz })) === 3);
  r = await tr.post(`/manage/quizzes/${qz}/questions`, { body: 'Invalid', type: 'single', choices: [{ body: 'A' }, { body: 'B' }] });
  check('Question with no correct answer is rejected', r.status === 422 && /exactly one correct/.test(r.json.error));
  const single = await M.Question.findOne({ body: 'Pick one' });
  const before = single.choices.map((c) => String(c._id));
  await tr.put(`/manage/questions/${single._id}`, { body: 'Pick one (edited)', type: 'single', points: 2, choices: [{ body: 'A' }, { body: 'B2', isCorrect: true }, { body: 'C' }] });
  const after = (await M.Question.findById(single._id)).choices.map((c) => String(c._id));
  check('Editing a question keeps choice ids stable', JSON.stringify(before) === JSON.stringify(after));

  await tr.put(`/manage/courses/${newCourse}`, { title: 'Escalation Handling ዓለም', summary: 'When and how to escalate.', category: 'Customer Service', status: 'published', certificateEnabled: true });
  check('Course published', (await M.Course.findById(newCourse)).status === 'published');
  const inbound = await M.Team.findOne({ name: 'Inbound Customer Care' });
  const due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  r = await tr.post(`/manage/courses/${newCourse}/enrolments`, { teamIds: [String(inbound._id)], autoEnrolNew: true, dueDate: due });
  const members = await M.User.countDocuments({ team: inbound._id, active: true });
  check('Whole team enrolled with due date', (await M.Enrolment.countDocuments({ course: newCourse, dueDate: due })) === members, `${members} members`);
  check('Team set for automatic enrolment', !!(await M.TeamCourse.exists({ team: inbound._id, course: newCourse })));
  r = await tr.get(`/manage/courses/${newCourse}/enrolments`);
  check('Enrolments page loads', r.status === 200 && r.json.enrolled.length === members);

  console.log('\nTrainer: reports');
  r = await tr.get('/reports');
  check('Overview report', r.status === 200 && r.json.courses.length > 0 && r.json.summary.learners > 0);
  r = await tr.get(`/reports/courses/${cid}`);
  check('Course report', r.status === 200 && r.json.enrolments.length > 0);
  r = await tr.get(`/reports/quizzes/${quiz._id}`);
  check('Quiz question analysis', r.status === 200 && r.json.questions.length > 0);
  r = await tr.get(`/reports/users/${agentUser._id}`);
  check('Learner report', r.status === 200 && r.json.attempts.length >= 2);
  r = await tr.get(`/attempts/${attempt2}/result`);
  check("Trainer can review a learner's answers", r.status === 200 && r.json.isOwner === false);
  r = await tr.get(`/attempts/${attemptId}/result`);
  check("Trainer still sees the full review of a failed attempt", r.json.reviewHidden === false && r.json.questions.length > 0);
  r = await tr.get('/reports/export?type=enrolments');
  check('Progress CSV export', r.status === 200 && r.text.includes('Progress %') && /text\/csv/.test(r.headers.get('content-type')));
  r = await tr.get('/reports/export?type=attempts');
  check('Quiz results CSV export', r.status === 200 && r.text.includes('Percent'));
  r = await tr.get('/admin/users');
  check('Trainer cannot manage people (403)', r.status === 403);

  // ---------------------------------------------------------------- team lead
  console.log('\nTeam lead: scoped reports');
  const tl = new Client();
  await tl.login('dawit.bekele@shaggar.test', 'Welcome@123');
  const sales = await M.Team.findOne({ name: 'Outbound Sales' });
  const outsider = await M.User.findOne({ team: inbound._id, role: 'agent' });
  const insider = await M.User.findOne({ team: sales._id, role: 'agent' });
  r = await tl.get('/reports');
  const names = r.json.learners.map((l) => l.name);
  check('Team lead sees own agents', names.includes(insider.name));
  check("Team lead does not see other teams' agents", !names.includes(outsider.name));
  r = await tl.get(`/reports/users/${outsider._id}`);
  check('Team lead blocked from other team member (403)', r.status === 403);
  r = await tl.get(`/reports?team=${inbound._id}`);
  check('Team lead blocked from other team filter (403)', r.status === 403);
  r = await tl.get(`/reports/users/${insider._id}`);
  check('Team lead can open own team member', r.status === 200);
  r = await tl.get('/reports/export');
  check('Team lead CSV only has own team', !r.text.includes(outsider.name) && r.text.includes(insider.name));
  r = await tl.get('/manage/courses');
  check('Team lead cannot manage courses (403)', r.status === 403);

  // ---------------------------------------------------------------- admin
  console.log('\nAdmin: people and teams');
  const ad = new Client();
  await ad.login('admin@shaggar.test', 'Admin@12345');
  r = await ad.get('/dashboard');
  check('Admin dashboard shows snapshot', r.json.snapshot && r.json.snapshot.learners > 0);
  r = await ad.get('/admin/users?role=agent&status=all&q=a');
  check('People search', r.status === 200 && r.json.users.length > 0);
  r = await ad.get(`/admin/teams/${inbound._id}`);
  check('Team page lists members', r.status === 200 && r.json.members.length > 0);
  const deptCS0 = await M.Department.findOne({ code: 'CS' });
  r = await ad.post('/admin/users', { name: 'New Hire', email: 'new.hire@shaggar.test', role: 'agent', team: String(inbound._id) });
  check('A new student needs a department', r.status === 422 && /department/.test(r.json.error));
  r = await ad.post('/admin/users', { name: 'New Hire', email: 'new.hire@shaggar.test', role: 'agent', team: String(inbound._id), department: String(deptCS0._id) });
  const tempPw = r.json.temporaryPassword;
  const nh = await M.User.findOne({ email: 'new.hire@shaggar.test' });
  check('Person created with temporary password', r.status === 201 && !!tempPw && nh.mustChangePassword);
  check('A student created by an administrator is NOT approved automatically', nh.registration.status === 'pending');
  check('New team member auto-enrolled in team courses',
    (await M.Enrolment.countDocuments({ user: nh._id })) === (await M.TeamCourse.countDocuments({ team: inbound._id })));
  r = await ad.post('/admin/users', { name: 'Dup', email: 'new.hire@shaggar.test', role: 'agent' });
  check('Duplicate email rejected', r.status === 422 && /already uses that email/.test(r.json.error));
  const adminUser = await M.User.findOne({ email: 'admin@shaggar.test' });
  r = await ad.put(`/admin/users/${adminUser._id}`, { name: 'System Admin', email: 'admin@shaggar.test', role: 'agent', active: true });
  check('Admin cannot demote themselves', r.status === 422 && /cannot remove your own administrator role/.test(r.json.error));

  const csv = '﻿name,email,role,team,campaign,employee_id,password\nሰላም ተስፋዬ,selam.t@shaggar.test,agent,Night Shift,Telecom,SHG-900,\nTigist Haile,tigist.haile@shaggar.test,agent,Outbound Sales,,SHG-901,\nBad Row,not-an-email,agent,,,,\n';
  const fd = new FormData();
  fd.append('csv', new Blob([csv], { type: 'text/csv' }), 'people.csv');
  r = await ad.post('/admin/users/import', fd);
  const statuses = (r.json.results || []).map((x) => x.status.split(':')[0]);
  check('CSV import: created, updated and skipped rows', JSON.stringify(statuses) === JSON.stringify(['Created', 'Updated', 'Skipped']), JSON.stringify(statuses));
  check('CSV import keeps Amharic names and creates new teams',
    (await M.User.findOne({ email: 'selam.t@shaggar.test' }))?.name === 'ሰላም ተስፋዬ' && !!(await M.Team.exists({ name: 'Night Shift' })));

  const nhc = new Client();
  r = await nhc.login('new.hire@shaggar.test', tempPw);
  check('New person must change password', r.json.user?.mustChangePassword === true);
  r = await nhc.get('/courses');
  check('…and cannot skip it', r.status === 403 && r.json.code === 'PASSWORD_CHANGE_REQUIRED');
  r = await nhc.post('/auth/password', { current: tempPw, new: 'MyOwnPass#1', confirm: 'MyOwnPass#1' });
  if (r.json.token) nhc.token = r.json.token;
  r = await nhc.get('/dashboard');
  check('Password changed, dashboard reachable', r.status === 200);

  await ad.put(`/admin/users/${nh._id}`, { name: 'New Hire', email: 'new.hire@shaggar.test', role: 'agent', team: String(inbound._id), active: false });
  check('Editing without a department field keeps the department', String((await M.User.findById(nh._id)).department) === String(deptCS0._id));
  r = await nhc.get('/dashboard');
  check('Deactivated person is signed out', r.status === 401);

  const rl = new Client();
  for (let i = 0; i < 6; i++) r = await rl.login('ratelimit@shaggar.test', 'nope');
  check('Login rate limit after repeated failures', r.status === 429 && /Too many failed attempts/.test(r.json.error));


  // ---------------------------------------------------------------- registration & approval
  console.log('\nRegistration and approval workflow');
  const deptCS = await M.Department.findOne({ code: 'CS' });
  const deptSales = await M.Department.findOne({ code: 'SALES' });
  const pdfDoc = { content: '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n', type: 'application/pdf', name: 'diploma.pdf' };
  const form = (fields, files = {}) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) for (const x of [].concat(v)) fd.append(k, String(x));
    for (const [k, list] of Object.entries(files)) for (const f of [].concat(list)) fd.append(k, new Blob([f.content], { type: f.type }), f.name);
    return fd;
  };
  r = await anon.get('/meta');
  check('Meta lists active departments and the registration form', r.json.departments?.length === 3 && r.json.registration?.fields?.phone === 'required' && !!r.json.branding);

  r = await anon.post('/auth/register', form({ name: 'Solo', email: 'bad', password: 'short', passwordConfirm: 'x' }));
  check('Self-registration validates every field', r.status === 422 && r.json.errors.length >= 5, JSON.stringify(r.json.errors));
  const selfFields = {
    name: 'Abel Tesfaye', email: 'abel.t@shaggar.test', password: 'Student#2026', passwordConfirm: 'Student#2026',
    department: String(deptCS._id), phone: '+251 911 555123', program: 'Customer Care Associate', termsAccepted: 'true', documentLabels: 'Diploma',
  };
  r = await anon.post('/auth/register', form({ ...selfFields, phone: '' }));
  const selfPhoneError = r.json.errors?.find((e) => /phone/i.test(e));
  r = await anon.post('/auth/register', form({ ...selfFields, program: 'Not a real program' }));
  check('Program must be one the department offers', r.status === 422 && r.json.errors.some((e) => /program offered/.test(e)));
  r = await anon.post('/auth/register', form(selfFields, { documents: { content: 'MZ-not-a-pdf', type: 'application/pdf', name: 'fake.pdf' } }));
  check('A fake PDF is rejected by its content', r.status === 422 && r.json.errors.some((e) => /real PDF/.test(e)));
  r = await anon.post('/auth/register', form(selfFields, { documents: pdfDoc }));
  check('Student registers themselves (pending)', r.status === 201 && !!r.json.token && r.json.user.registrationStatus === 'pending', r.json.error);
  const stu = new Client();
  stu.token = r.json.token;
  const abel = await M.User.findOne({ email: 'abel.t@shaggar.test' });
  check('Self-registration stores the document and history', abel.registration.documents.length === 1 && abel.registration.history[0].action === 'submitted' && abel.registration.source === 'self');
  r = await anon.post('/auth/register', form(selfFields, { documents: pdfDoc }));
  check('Duplicate registration (same email) is refused', r.status === 422 && /already exists/.test(r.json.error));
  check('Department Head was notified of the new application', !!(await M.Notification.exists({ user: (await M.User.findOne({ email: 'head.cs@shaggar.test' }))._id, link: `/registrations/${abel._id}` })));

  const callHandling = await M.Course.findOne({ title: 'Call Handling Excellence' });
  const chLesson = await M.Lesson.findOne({ course: callHandling._id });
  const chQuiz = await M.Quiz.findOne({ course: callHandling._id });
  const openCourse = await M.Course.findOne({ selfEnrol: true, status: 'published', department: null });
  r = await stu.get('/courses');
  check('Pending student: catalog API refused', r.status === 403 && r.json.code === 'REGISTRATION_NOT_APPROVED');
  r = await stu.get(`/courses/${callHandling._id}`);
  check('Pending student: direct course URL refused', r.status === 403 && r.json.code === 'REGISTRATION_NOT_APPROVED');
  r = await stu.get(`/lessons/${chLesson._id}`);
  check('Pending student: direct lesson URL refused', r.status === 403);
  r = await stu.post(`/quizzes/${chQuiz._id}/start`);
  check('Pending student: cannot start a quiz', r.status === 403);
  r = await stu.post(`/courses/${openCourse._id}/enrol`);
  check('Pending student: cannot self-enrol', r.status === 403 && !(await M.Enrolment.exists({ user: abel._id })));
  r = await stu.get('/dashboard');
  check('Pending student: dashboard shows registration status', r.status === 200 && r.json.student?.registration?.status === 'pending' && !!r.json.student.blocked);
  r = await stu.get('/registration/me');
  check('Student can view their own application', r.status === 200 && r.json.application.registration.documents.length === 1 && r.json.editable === 'full');
  r = await stu.get('/registrations');
  check('Student cannot list applications (403)', r.status === 403);

  console.log('\nRegistrar');
  const reg = new Client();
  r = await reg.login('registrar@shaggar.test', 'Welcome@123');
  check('Registrar signs in', r.status === 200 && r.json.user.role === 'registrar');
  r = await reg.get('/registrations?status=pending');
  check('Registrar sees pending applications in all departments', r.status === 200 && r.json.applications.some((a) => a.name === 'Abel Tesfaye') && r.json.canCreate === true);
  const staffFields = { name: 'Liya Kebede', email: 'liya.k@shaggar.test', department: String(deptSales._id), phone: '+251 922 123456', termsAccepted: 'true', studentId: '' };
  r = await reg.post('/registrations', form({ ...staffFields, phone: '' }));
  check('Registrar form uses the same validation as self-registration', r.status === 422 && r.json.errors.includes(selfPhoneError), `${selfPhoneError} / ${JSON.stringify(r.json.errors)}`);
  r = await reg.post('/registrations', form({ ...staffFields, termsAccepted: '' }));
  check('Registrar must confirm the student accepted the terms', r.status === 422 && r.json.errors.some((e) => /terms/.test(e)));
  r = await reg.post('/registrations', form(staffFields));
  const liyaId = r.json.application?._id;
  const liya = await M.User.findById(liyaId);
  check('Registrar creates a student account (pending, temporary password)', r.status === 201 && !!r.json.temporaryPassword && liya.registration.status === 'pending' && liya.registration.source === 'registrar' && liya.mustChangePassword);
  r = await reg.post(`/registrations/${abel._id}/decision`, { decision: 'approve' });
  check('Registrar cannot approve registrations by default (403)', r.status === 403 && (await M.User.findById(abel._id)).registration.status === 'pending');
  r = await reg.req('PUT', `/registrations/${liyaId}`, form({ ...staffFields, phone: '+251 922 000111' }));
  check('Registrar corrects student data', r.status === 200 && (await M.User.findById(liyaId)).phone === '+251 922 000111');
  check('…and the change is audited', !!(await M.AuditLog.exists({ action: 'registration.edited', targetId: liya._id })));
  r = await reg.get('/registrations/export?status=pending');
  check('Registrar exports registrations as CSV', r.status === 200 && r.text.includes('Liya Kebede') && /text\/csv/.test(r.headers.get('content-type')));
  r = await reg.get('/dashboard');
  check('Registrar dashboard', r.status === 200 && !!r.json.registrar && r.json.registrar.counts.pending >= 3);
  r = await reg.get('/manage/courses');
  check('Registrar cannot manage courses (403)', r.status === 403);
  r = await reg.get(`/reports/users/${agentUser._id}`);
  check("Registrar cannot open a student's academic report (403)", r.status === 403);

  console.log('\nDepartment Head');
  const hcs = new Client();
  r = await hcs.login('head.cs@shaggar.test', 'Welcome@123');
  check('Department Head signs in', r.status === 200 && r.json.user.role === 'department_head');
  r = await hcs.get('/registrations');
  check('Department Head sees only their department', r.json.applications.some((a) => a._id === String(abel._id)) && !r.json.applications.some((a) => a._id === liyaId));
  r = await hcs.get(`/registrations/${liyaId}`);
  check("Department Head cannot open another department's application (403)", r.status === 403);
  r = await hcs.post(`/registrations/${liyaId}/decision`, { decision: 'approve' });
  check("Department Head cannot decide another department's application (403)", r.status === 403);
  r = await hcs.get(`/registrations/${abel._id}`);
  const docUrl = r.json.application?.registration.documents[0]?.url;
  check('Department Head reviews the application', r.status === 200 && r.json.canDecide === true && r.json.decisionNeedsOverride === false);
  r = await hcs.get(docUrl);
  check('…and opens the supporting document', r.status === 200 && r.text.startsWith('%PDF'));
  r = await reg.get(`/registrations/${abel._id}/documents/${abel.registration.documents[0]._id}`);
  check('Registrar can open documents too', r.status === 200);
  r = await agent.get(`/registrations/${abel._id}/documents/${abel.registration.documents[0]._id}`);
  check("Other students cannot open someone's documents (403)", r.status === 403);
  r = await hcs.post(`/registrations/${abel._id}/decision`, { decision: 'reject' });
  check('Rejecting needs a reason', r.status === 422);
  r = await hcs.post(`/registrations/${abel._id}/decision`, { decision: 'correction', reason: 'Please add your phone country code and upload your diploma.' });
  check('Department Head requests a correction', r.status === 200 && (await M.User.findById(abel._id)).registration.status === 'correction_requested');
  r = await stu.get('/registration/me');
  check('Student sees the correction request and feedback', r.json.application.registration.status === 'correction_requested' && /diploma/.test(r.json.application.registration.reason));
  r = await stu.get('/notifications');
  check('Student was notified', r.status === 200 && r.json.unread >= 1 && r.json.notifications.some((n) => n.title === 'Correction requested'));
  r = await stu.req('PUT', '/registration/me', form({ ...selfFields, phone: '+251 911 555124', termsAccepted: 'true' }, { documents: { ...pdfDoc, name: 'diploma-2.pdf' } }));
  const abel2 = await M.User.findById(abel._id);
  check('Student corrects and resubmits (pending again)', r.status === 200 && abel2.registration.status === 'pending' && abel2.registration.documents.length === 2, r.json.error);
  r = await hcs.post(`/registrations/${abel._id}/decision`, { decision: 'approve' });
  const abel3 = await M.User.findById(abel._id);
  check('Department Head approves', r.status === 200 && abel3.registration.status === 'approved');
  check('Approval assigns a student ID', /^STU-\d{4}-\d{5}$/.test(abel3.employeeId || ''), abel3.employeeId);
  check('Approval is recorded with reviewer and time', String(abel3.registration.reviewedBy) === String((await M.User.findOne({ email: 'head.cs@shaggar.test' }))._id) && !!abel3.registration.reviewedAt
    && abel3.registration.history.map((h) => h.action).join(',') === 'submitted,correction_requested,resubmitted,approved');
  check('Audit log has the decisions', (await M.AuditLog.countDocuments({ targetId: abel._id, action: { $in: ['registration.correction_requested', 'registration.approved'] } })) === 2);
  r = await hcs.post(`/registrations/${abel._id}/decision`, { decision: 'reject', reason: 'Changed my mind' });
  check('A decided application cannot be changed by the Department Head (403)', r.status === 403);
  r = await stu.get('/courses');
  check('Approved student can now open the catalog', r.status === 200);
  r = await stu.post(`/courses/${openCourse._id}/enrol`);
  check('Approved student can join an open course', r.status === 200);

  r = await ad.post(`/registrations/${liyaId}/decision`, { decision: 'approve' });
  check('Administrator decision needs an explicit override', r.status === 403 && r.json.code === 'OVERRIDE_REQUIRED');
  r = await ad.post(`/registrations/${liyaId}/decision`, { decision: 'approve', override: true, reason: 'x' });
  check('Override needs a reason', r.status === 422);
  r = await ad.post(`/registrations/${liyaId}/decision`, { decision: 'approve', override: true, reason: 'Department Head on leave; approved by the Dean.' });
  check('Administrator override is applied and audited', r.status === 200 && !!(await M.AuditLog.exists({ action: 'registration.override', targetId: liya._id })));

  console.log('\nDepartment Head: courses, reports, certificates');
  const onboarding = await M.Course.findOne({ title: 'New Agent Onboarding' });
  r = await hcs.get('/manage/courses');
  check('Department Head sees only department courses', r.status === 200 && r.json.courses.length === 1 && r.json.courses[0].title === 'Call Handling Excellence');
  r = await hcs.get(`/manage/courses/${onboarding._id}`);
  check('Department Head cannot open an institution-wide course (403)', r.status === 403);
  r = await hcs.post(`/manage/courses/${onboarding._id}/quizzes`, { title: 'Sneaky quiz' });
  check('…nor add a quiz to it (403)', r.status === 403 && !(await M.Quiz.exists({ title: 'Sneaky quiz' })));
  r = await hcs.post('/manage/courses', { title: 'No department' });
  check('Department Head must choose a department', r.status === 422);
  r = await hcs.post('/manage/courses', { title: 'Wrong department', department: String(deptSales._id) });
  check("Department Head cannot create a course in another department", r.status === 422);
  r = await hcs.post('/manage/courses', { title: 'CS Essentials', department: String(deptCS._id), status: 'draft', certificateEnabled: true, certificateRequiresApproval: true });
  const csCourse = r.json.course?._id;
  check('Department Head creates a department course', r.status === 201 && !!csCourse);
  r = await hcs.get(`/manage/courses/${csCourse}`);
  r = await hcs.post(`/manage/modules/${r.json.modules[0]._id}/lessons`, form({ title: 'Welcome', type: 'text', body: 'Hello' }));
  const csLesson = r.json.lesson?._id;
  check('…adds a lesson', r.status === 201 && !!csLesson);
  r = await hcs.put(`/manage/courses/${csCourse}`, { title: 'CS Essentials', department: String(deptCS._id), status: 'published', certificateEnabled: true, certificateRequiresApproval: true });
  check('…and publishes it (audited)', r.status === 200 && !!(await M.AuditLog.exists({ action: 'course.published', targetId: csCourse })));
  r = await hcs.get(`/manage/courses/${csCourse}/enrolments`);
  check('Enrolment list offers only approved students of the department', r.status === 200 && r.json.users.every((u) => u.role === 'agent') && r.json.users.some((u) => u.name === 'Abel Tesfaye')
    && !r.json.users.some((u) => u.name === 'Meseret Alemayehu') && !r.json.users.some((u) => u.name === 'Liya Kebede') && r.json.teams.length === 0);
  r = await hcs.post(`/manage/courses/${csCourse}/enrolments`, { userIds: [String(abel._id), String(liyaId)] });
  check('Department Head enrols own students only', (await M.Enrolment.exists({ user: abel._id, course: csCourse })) && !(await M.Enrolment.exists({ user: liyaId, course: csCourse })));
  r = await stu.post(`/lessons/${csLesson}/complete`, {});
  const pendingCert = await M.Certificate.findOne({ user: abel._id, course: csCourse });
  check('Completion creates a certificate waiting for authorization', r.json.finished === true && pendingCert?.status === 'pending');
  r = await stu.get('/certificates');
  check('Pending certificate is not listed for the student yet', !r.json.certificates.some((c) => c.code === pendingCert.code) && r.json.pending === 1);
  r = await stu.get(`/certificates/${pendingCert.code}`);
  check('Pending certificate cannot be opened by the student', r.status === 403 && r.json.code === 'CERTIFICATE_PENDING');
  r = await anon.get(`/verify?code=${pendingCert.code}`);
  check('Pending certificate does not verify', r.json.valid === false);
  r = await reg.get('/certificate-approvals');
  check('Registrar cannot authorize certificates by default (403)', r.status === 403);
  r = await hcs.get('/certificate-approvals');
  check('Department Head sees certificates to authorize', r.status === 200 && r.json.certificates.some((c) => c.code === pendingCert.code));
  r = await hcs.post(`/certificate-approvals/${pendingCert._id}/authorize`);
  check('Department Head authorizes the certificate', r.status === 200 && (await M.Certificate.findById(pendingCert._id)).status === 'issued');
  r = await hcs.post(`/certificate-approvals/${pendingCert._id}/authorize`);
  check('No double issuing', r.status === 409 && (await M.Certificate.countDocuments({ user: abel._id, course: csCourse })) === 1);
  r = await anon.get(`/verify?code=${pendingCert.code}`);
  check('Authorized certificate verifies without exposing private details', r.json.valid === true && !('employeeId' in r.json.certificate) && !('email' in r.json.certificate));
  r = await stu.get(`/certificates/${pendingCert.code}`);
  check('Student opens the issued certificate with branding', r.status === 200 && r.json.certificate.departmentName === 'Customer Service' && !!r.json.branding?.certificate);

  r = await hcs.get('/reports');
  const hcsNames = r.json.learners.map((l) => l.name);
  check('Department Head reports cover only their department', r.status === 200 && hcsNames.includes('Abel Tesfaye') && !hcsNames.includes(insider.name));
  r = await hcs.get(`/reports/users/${insider._id}`);
  check("Department Head cannot open another department's student (403)", r.status === 403);
  r = await hcs.get(`/reports?department=${deptSales._id}`);
  check('Department Head cannot filter to another department (403)', r.status === 403);
  r = await hcs.get('/dashboard');
  check('Department Head dashboard', r.status === 200 && !!r.json.departmentHead && r.json.departmentHead.departments.length === 1);
  r = await hcs.get('/admin/users');
  check('Department Head cannot manage people (403)', r.status === 403);

  console.log('\nAdministrator: roles, departments, branding, audit');
  const registrarUser = await M.User.findOne({ email: 'registrar@shaggar.test' });
  r = await ad.put(`/admin/users/${registrarUser._id}`, { name: registrarUser.name, email: registrarUser.email, role: 'registrar', accountStatus: 'active', departments: [], permApproveRegistrations: true });
  const meseret = await M.User.findOne({ email: 'meseret.alemayehu@shaggar.test' });
  r = await reg.post(`/registrations/${meseret._id}/decision`, { decision: 'approve' });
  check('Registrar can approve once an administrator grants it', r.status === 200 && !!(await M.AuditLog.exists({ action: 'user.permissions_changed', targetId: registrarUser._id })));
  r = await reg.put(`/admin/users/${registrarUser._id}`, { name: registrarUser.name, email: registrarUser.email, role: 'admin' });
  check('Nobody but an administrator can change roles (no self-escalation)', r.status === 403 && (await M.User.findById(registrarUser._id)).role === 'registrar');

  r = await ad.post('/admin/departments', { name: 'Quality Assurance', code: 'qa', programs: 'QA Analyst\nCoach' });
  check('Department created', r.status === 201 && r.json.department.code === 'QA' && r.json.department.programs.length === 2);
  r = await ad.post('/admin/departments', { name: 'Another', code: 'QA' });
  check('Department codes are unique', r.status === 422);
  r = await ad.del(`/admin/departments/${deptCS._id}`);
  check('A department in use cannot be deleted (409)', r.status === 409);
  r = await ad.post('/admin/users', { name: 'Head QA', email: 'head.qa@shaggar.test', role: 'department_head', departments: [] });
  check('A Department Head needs a department', r.status === 422);

  r = await reg.get('/admin/settings');
  check('Only administrators open settings (403)', r.status === 403);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const imgForm = (content, name, type) => form({}, { file: { content, name, type } });
  r = await ad.post('/admin/settings/files/logo', imgForm('not really a png', 'logo.png', 'image/png'));
  check('A fake PNG logo is rejected', r.status === 422);
  r = await ad.post('/admin/settings/files/logo', imgForm('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'logo.svg', 'image/svg+xml'));
  check('An SVG logo with a script is rejected', r.status === 422);
  r = await ad.post('/admin/settings/files/logo', imgForm(png, 'logo.png', 'image/png'));
  const logoUrl = r.json.branding?.logoUrl;
  check('Logo uploaded', r.status === 200 && !!logoUrl, r.json.error);
  const logoRes = await fetch(base.replace(/\/api$/, '') + logoUrl);
  check('Logo is served as an image with a locked-down policy', logoRes.status === 200 && logoRes.headers.get('content-type') === 'image/png' && /sandbox/.test(logoRes.headers.get('content-security-policy') || ''));
  r = await ad.post('/admin/settings/files/logo', imgForm('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#0e5e6f"/></svg>', 'logo.svg', 'image/svg+xml'));
  const oldLogoId = logoUrl.split('/').pop();
  const oldLeft = await mongoose.connection.db.collection('brandingFiles.files').countDocuments({ _id: new mongoose.Types.ObjectId(oldLogoId) });
  check('Replacing the logo keeps only the new file', r.status === 200 && r.json.branding.logoUrl !== logoUrl && oldLeft === 0);
  r = await ad.put('/admin/settings', { branding: { placements: { login: { enabled: false, size: 'large', align: 'center' }, dashboardStudent: { enabled: true, size: 'small', align: 'right' } }, colors: { primary: '#123456' } } });
  check('Logo placements and colors saved', r.status === 200);
  r = await anon.get('/meta');
  check('Placements persist and are public', r.json.branding.placements.login.enabled === false && r.json.branding.placements.dashboardStudent.enabled === true
    && r.json.branding.placements.dashboardStudent.align === 'right' && r.json.branding.colors.primary === '#123456' && !!r.json.branding.logoUrl);
  r = await ad.put('/admin/settings', { branding: { colors: { primary: 'red' } } });
  check('Invalid color rejected', r.status === 422);
  r = await ad.put('/admin/settings', { certificate: { signatories: [{ name: 'Dr. Almaz Bekele', title: 'Academic Director' }, { name: 'Yohannes T.', title: 'Registrar' }], logoPosition: 'top', logoAlign: 'center' } });
  r = await ad.post('/admin/settings/files/signature1', imgForm(png, 'sig.png', 'image/png'));
  check('Certificate signatories and signature image saved', r.status === 200 && r.json.branding.certificate.signatories.length === 2 && !!r.json.branding.certificate.signatories[1].signatureUrl
    && r.json.branding.certificate.logoPosition === 'top');
  r = await ad.del('/admin/settings/files/logo');
  r = await anon.get('/meta');
  check('Logo removed: default appearance', r.json.branding.logoUrl === null);

  r = await ad.get('/admin/audit');
  check('Audit log lists important actions', r.status === 200 && r.json.entries.length > 0 && r.json.actions.includes('registration.approved') && r.json.actions.includes('settings.updated'));
  check('Audit log never stores passwords', !(await M.AuditLog.exists({ $or: [{ 'details.password': { $exists: true } }, { 'details.passwordHash': { $exists: true } }] })));
  r = await hcs.get('/admin/audit');
  check('Only administrators read the audit log (403)', r.status === 403);
  r = await ad.get('/dashboard');
  check('Administrator dashboard shows registration statistics', r.status === 200 && !!r.json.admin && r.json.admin.trend.length === 6 && r.json.admin.departments.length === 4);

  await ad.put(`/admin/users/${abel._id}`, { name: abel.name, email: abel.email, role: 'agent', accountStatus: 'suspended' });
  r = await stu.get('/dashboard');
  check('Suspended account is signed out', r.status === 401);
  r = await new Client().login('abel.t@shaggar.test', 'Student#2026');
  check('Suspended account cannot sign in', r.status === 403 && /suspended/.test(r.json.error));
  check('Suspending keeps registration approval separate', (await M.User.findById(abel._id)).registration.status === 'approved');

  console.log('\nMigration');
  const legacyId = new mongoose.Types.ObjectId();
  await mongoose.connection.db.collection('users').insertOne({ _id: legacyId, name: 'Old Agent', email: 'old.agent@shaggar.test', passwordHash: 'x', role: 'agent', active: true, createdAt: new Date() });
  const legacyCert = await mongoose.connection.db.collection('certificates').insertOne({ user: legacyId, course: onboarding._id, code: 'SHG-2025-LEGACY0001', issuedAt: new Date() });
  const { runMigrations } = await import('../src/migrations/index.js');
  await mongoose.connection.db.collection('migrations').deleteMany({});
  await runMigrations();
  const old = await M.User.findById(legacyId).lean();
  check('Migration: existing students become approved (legacy) and keep access', old.registration?.status === 'approved' && old.registration.source === 'legacy' && old.accountStatus === 'active');
  check('Migration: existing certificates stay valid', (await M.Certificate.findById(legacyCert.insertedId).lean()).status === 'issued');
  const again = await runMigrations();
  check('Migration is idempotent', again.length === 0);

  r = await ad.del(`/manage/courses/${newCourse}`, { confirmTitle: 'wrong' });
  check('Course delete needs exact title', r.status === 422 && !!(await M.Course.exists({ _id: newCourse })));
  r = await ad.del(`/manage/courses/${newCourse}`, { confirmTitle: 'Escalation Handling ዓለም' });
  const filesLeft = await mongoose.connection.db.collection('lessonFiles.files').countDocuments({ _id: new mongoose.Types.ObjectId(String(l2.file.id)) });
  const gone = [!(await M.Course.exists({ _id: newCourse })), !(await M.Lesson.exists({ _id: l2._id })), filesLeft === 0, !(await M.Enrolment.exists({ course: newCourse }))];
  check('Course deleted with its lessons, files and enrolments', gone.every(Boolean), JSON.stringify(gone));
} catch (e) {
  fail++;
  console.error('\nTest run crashed:', e);
} finally {
  server.close();
  await mongoose.connection.dropDatabase().catch(() => {});
  await disconnectDB();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
