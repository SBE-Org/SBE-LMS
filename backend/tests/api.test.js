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
  check('Demo data: 16 people, 4 courses', (await M.User.countDocuments()) === 17 && (await M.Course.countDocuments()) === 4);
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
  r = await ad.post('/admin/users', { name: 'New Hire', email: 'new.hire@shaggar.test', role: 'agent', team: String(inbound._id) });
  const tempPw = r.json.temporaryPassword;
  const nh = await M.User.findOne({ email: 'new.hire@shaggar.test' });
  check('Person created with temporary password', r.status === 201 && !!tempPw && nh.mustChangePassword);
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
  r = await nhc.get('/dashboard');
  check('Deactivated person is signed out', r.status === 401);

  const rl = new Client();
  for (let i = 0; i < 6; i++) r = await rl.login('ratelimit@shaggar.test', 'nope');
  check('Login rate limit after repeated failures', r.status === 429 && /Too many failed attempts/.test(r.json.error));

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
