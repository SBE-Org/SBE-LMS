import {
  User, Team, Department, Course, Module, Lesson, Quiz, Question, QuizAttempt, Enrolment, TeamCourse, LessonProgress, Certificate,
} from '../models/index.js';
import { hashPassword } from '../utils/password.js';
import { today, addDays } from '../utils/dates.js';
import { checkCompletion } from '../services/progress.js';
import demoCourses from './demoCourses.js';

/** Creates the first administrator account. */
export async function createAdmin(name, email, password) {
  return User.create({
    name, email: email.toLowerCase(), passwordHash: await hashPassword(password), role: 'admin', active: true, mustChangePassword: false,
  });
}

/** Small seeded random generator so demo data is the same on every install. */
function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { int: (min, max) => min + Math.floor(next() * (max - min + 1)), pick: (arr) => arr[Math.floor(next() * arr.length)] };
}

/** A timestamp `daysAgo` days ago at the given hour. */
const ts = (daysAgo, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d;
};

/** Records a submitted attempt where each answer is right with the given probability. */
async function simulateAttempt(r, userId, quiz, skill, when) {
  const questions = await Question.find({ quiz: quiz._id }).sort({ position: 1 }).lean();
  let score = 0;
  let max = 0;
  const answers = [];
  for (const q of questions) {
    const right = q.choices.filter((c) => c.isCorrect).map((c) => c._id);
    const wrong = q.choices.filter((c) => !c.isCorrect).map((c) => c._id);
    const ok = r.int(1, 100) <= skill * 100 || !wrong.length;
    max += q.points;
    if (ok) score += q.points;
    answers.push({ question: q._id, selected: ok ? right : [r.pick(wrong)], correct: ok, points: ok ? q.points : 0 });
  }
  const percent = max ? Math.floor((score * 100) / max) : 0;
  await QuizAttempt.create({
    user: userId, quiz: quiz._id, course: quiz.course, status: 'submitted', questionOrder: questions.map((q) => q._id),
    startedAt: when, submittedAt: new Date(when.getTime() + 600000), score, maxScore: max, percent, passed: percent >= quiz.passMark, answers,
  });
}

/**
 * Demo content: teams, staff, agents, four BPO training courses with quizzes,
 * and realistic progress so the reports have something to show.
 * Every demo person has the password "Welcome@123".
 */
export async function seedDemo(adminId) {
  const r = rng(2026);
  const pw = await hashPassword('Welcome@123');
  const approved = (when) => ({
    status: 'approved', source: 'registrar', submittedAt: when, reviewedAt: when, termsAcceptedAt: when,
    history: [{ status: 'pending', action: 'created_by_staff', at: when }, { status: 'approved', action: 'approved', byName: 'Demo data', at: when }],
  });
  const mkUser = async (name, email, role, team, employeeId, extra = {}) =>
    (await User.create({
      name, email, passwordHash: pw, role, team, employeeId, active: true, accountStatus: 'active', mustChangePassword: false,
      createdAt: ts(60), lastLoginAt: ts(r.int(0, 6), r.int(8, 17)),
      ...(role === 'agent' ? { registration: approved(ts(55)) } : {}),
      ...extra,
    }))._id;

  // ---- departments (one per team in the demo) ----
  const deptDefs = [
    ['Customer Service', 'CS', 'Inbound and outbound customer care programmes.', ['Customer Care Associate', 'Technical Support Associate']],
    ['Sales & Retention', 'SALES', 'Telesales, retention and collections programmes.', ['Telesales Associate', 'Retention Specialist']],
    ['Back Office Operations', 'BO', 'Data entry, verification and processing programmes.', ['Data Processing Associate']],
  ];
  const departments = [];
  for (const [name, code, description, programs] of deptDefs) {
    departments.push((await Department.create({ name, code, description, programs }))._id);
  }

  // ---- teams and people ----
  const teamDefs = [
    ['Inbound Customer Care', 'Telecom support line', 'Hana Tesfaye', 'hana.tesfaye'],
    ['Outbound Sales', 'Insurance & banking products', 'Dawit Bekele', 'dawit.bekele'],
    ['Back Office & Data', 'Data entry and verification', 'Meron Alemu', 'meron.alemu'],
  ];
  await mkUser('Selam Girma', 'trainer@shaggar.test', 'trainer', null, 'SHG-T01');
  const teams = [];
  for (const [i, [name, campaign, lead, slug]] of teamDefs.entries()) {
    const team = await Team.create({ name, campaign });
    const leadId = await mkUser(lead, `${slug}@shaggar.test`, 'team_lead', team._id, `SHG-L${String(i + 1).padStart(2, '0')}`);
    team.lead = leadId;
    await team.save();
    teams.push(team._id);
  }
  const agentNames = [
    ['Abebe Kebede', 0], ['Tigist Haile', 0], ['Yonas Tadesse', 0], ['Mahlet Assefa', 0], ['Biruk Getachew', 0],
    ['Lidya Mekonnen', 1], ['Kaleb Worku', 1], ['Rahel Negash', 1], ['Samuel Desta', 1],
    ['Hiwot Abera', 2], ['Natnael Fikre', 2], ['Bethlehem Yirga', 2],
  ];
  const agents = [];
  for (const [i, [name, t]] of agentNames.entries()) {
    const email = `${name.toLowerCase().replace(/ /g, '.')}@shaggar.test`;
    agents.push({
      id: await mkUser(name, email, 'agent', teams[t], `SHG-A${String(i + 1).padStart(3, '0')}`, {
        department: departments[t], phone: `+251 911 ${String(100000 + i * 7919).slice(0, 6)}`, profile: { program: deptDefs[t][3][0] },
      }),
      team: t,
    });
  }

  // ---- Department Heads, a registrar and new applications waiting for review ----
  await mkUser('Kidist Mulugeta', 'head.cs@shaggar.test', 'department_head', null, 'SHG-H01', { department: departments[0], departments: [departments[0]] });
  await mkUser('Henok Tadesse', 'head.sales@shaggar.test', 'department_head', null, 'SHG-H02', { department: departments[1], departments: [departments[1], departments[2]] });
  await mkUser('Saron Bekele', 'registrar@shaggar.test', 'registrar', null, 'SHG-R01', { departments: [] });
  const applicants = [
    ['Meseret Alemayehu', 0, 'self', 'pending', null],
    ['Yared Solomon', 0, 'registrar', 'pending', null],
    ['Feven Girma', 1, 'self', 'correction_requested', 'Please upload a copy of your highest education certificate.'],
  ];
  for (const [i, [name, d, source, status, reason]] of applicants.entries()) {
    const when = ts(3 - i);
    await User.create({
      name, email: `${name.toLowerCase().replace(/ /g, '.')}@shaggar.test`, passwordHash: pw, role: 'agent', active: true, accountStatus: 'active',
      mustChangePassword: false, department: departments[d], phone: `+251 912 30${i}45${i}`, createdAt: when,
      profile: { program: deptDefs[d][3][0], educationLevel: 'Diploma' },
      registration: {
        status, source, submittedAt: when, termsAcceptedAt: when, reason,
        reviewedAt: status === 'pending' ? null : ts(1),
        history: [
          { status: 'pending', action: source === 'self' ? 'submitted' : 'created_by_staff', at: when },
          ...(status === 'correction_requested' ? [{ status, action: 'correction_requested', byName: 'Henok Tadesse', byRole: 'department_head', reason, at: ts(1) }] : []),
        ],
      },
    });
  }

  // ---- courses ----
  const courseIds = [];
  // Call handling belongs to Customer Service; the other demo courses are institution-wide.
  const courseDept = [null, departments[0], null, null];
  for (const [ci, c] of demoCourses.entries()) {
    const course = await Course.create({
      department: courseDept[ci] || null,
      title: c.title, summary: c.summary, category: c.category, status: 'published', selfEnrol: c.selfEnrol,
      certificateEnabled: true, createdBy: adminId, createdAt: ts(45), updatedAt: ts(20),
    });
    for (const [mi, m] of c.modules.entries()) {
      const mod = await Module.create({ course: course._id, title: m.title, position: mi + 1 });
      await Lesson.insertMany(m.lessons.map((l, li) => ({
        module: mod._id, course: course._id, title: l.title, type: l.type, body: l.body, videoUrl: l.videoUrl,
        durationMin: l.durationMin, position: li + 1,
      })));
    }
    const q = c.quiz;
    const quiz = await Quiz.create({
      course: course._id, title: q.title, description: q.description, passMark: q.passMark, timeLimitMin: q.timeLimitMin,
      maxAttempts: q.maxAttempts, showAnswers: true, shuffleQuestions: false, position: 1,
    });
    await Question.insertMany(q.questions.map((qu, qi) => ({
      quiz: quiz._id, course: course._id, body: qu.body, type: qu.type, points: 1, explanation: qu.explanation, position: qi + 1,
      choices: qu.choices.map((ch, ci) => ({ body: ch.body, isCorrect: ch.isCorrect, position: ci + 1 })),
    })));
    courseIds.push(course._id);
  }

  // ---- assignments ----
  // Onboarding + data protection: every team. Call handling: inbound. Sales: outbound.
  const assign = [[0, [0, 1, 2], 30], [2, [0, 1, 2], 21], [1, [0], 30], [3, [1], 30]];
  for (const [ci, teamIdx, dueDays] of assign) {
    for (const t of teamIdx) {
      await TeamCourse.create({ team: teams[t], course: courseIds[ci], dueDays, assignedBy: adminId, createdAt: ts(40) });
    }
  }
  const enrolments = [];
  for (const a of agents) {
    for (const [ci, teamIdx, dueDays] of assign) {
      if (!teamIdx.includes(a.team)) continue;
      const enrolDay = r.int(20, 40);
      await Enrolment.create({
        user: a.id, course: courseIds[ci], assignedBy: adminId,
        dueDate: addDays(today(), dueDays - enrolDay), enrolledAt: ts(enrolDay),
      });
      enrolments.push({ user: a.id, course: courseIds[ci] });
    }
  }

  // ---- simulated learning activity ----
  for (const e of enrolments) {
    const lessons = await Lesson.find({ course: e.course }).lean();
    const mods = await Module.find({ course: e.course }).lean();
    const pos = new Map(mods.map((m) => [String(m._id), m.position]));
    lessons.sort((a, b) => pos.get(String(a.module)) - pos.get(String(b.module)) || a.position - b.position);

    const roll = r.int(1, 100);
    const fraction = roll <= 15 ? 0 : roll <= 40 ? r.int(20, 80) / 100 : 1;
    const doneCount = Math.floor(lessons.length * fraction);
    await LessonProgress.insertMany(lessons.slice(0, doneCount).map((l, i) => ({
      user: e.user, lesson: l._id, course: e.course, completedAt: ts(Math.max(1, 18 - i), 11),
    })));
    if (fraction === 1) {
      for (const quiz of await Quiz.find({ course: e.course }).lean()) {
        const tries = r.int(1, 2);
        for (let t = 0; t < tries; t++) {
          await simulateAttempt(r, e.user, quiz, t === tries - 1 ? 0.85 : 0.55, ts(10 - t * 3, 14));
        }
      }
    }
    await checkCompletion(e.user, e.course);
  }

  // Completion dates should look historical rather than "now"
  const done = await Enrolment.find({ completedAt: { $ne: null } }, '_id').lean();
  for (const [i, d] of done.entries()) await Enrolment.updateOne({ _id: d._id }, { completedAt: ts(2 + (i % 9), 15) });
  const certs = await Certificate.find({}, '_id').lean();
  for (const [i, c] of certs.entries()) await Certificate.updateOne({ _id: c._id }, { issuedAt: ts(2 + (i % 9), 15) });
}
