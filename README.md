# Shaggar BPO Academy — MERN edition

A training platform (LMS) for Shaggar BPO Enterprise. People take courses and quizzes, earn certificates, and staff track progress. This version is rebuilt from the original PHP app on:

| Part | Technology | Folder | Deploy to |
|---|---|---|---|
| Database | MongoDB (lesson files stored in GridFS) | — | MongoDB Atlas (free tier works) |
| Backend (API) | Node.js 18+, Express 5, Mongoose 8 | `backend/` | Render, Railway, a VPS… |
| Frontend | React 18 + Vite, React Router | `frontend/` | Vercel |

Everything from the PHP version is here, plus (v2.1) departments, controlled student registration and branding — see **CHANGES.md** for the full list:
- **Roles:** System Administrator, Department Head, Registrar, Trainer, Team Lead and Student (stored as `agent`, so existing accounts keep working).
- **Registration & approval:** self-registration or registrar-created accounts on one standard form; applications stay *pending* until the Department Head approves, rejects or asks for a correction. Unapproved students cannot open course content, even through direct URLs or the API. Every decision is audited and notified.
- **Branding:** administrators upload the logo (PNG/JPG/SVG), choose where it appears (11 locations, each with size and alignment), set colours, certificate layout, signatories and seal — with a live preview, no redeploy.
- **Courses:** modules with reading, video and file lessons.
- **Quizzes:** single-answer, multiple-answer and true/false questions, with a time limit, an attempt limit, shuffling and answer review.
- **Completion:** automatic completion and certificates you can download as a PDF or print, plus a public page to verify a certificate.
- **Failed quizzes:** learners see only their score, and a "Try again" button while they have attempts left. The questions and correct answers are shown only after a pass. The server enforces this, so answers can't be found in the browser's network data. Trainers, admins and team leads always see the full review.
- **Enrolment:** people or whole teams, with due dates and auto-enrolment for people who join a team later.
- **Reports:** scoped per team lead, with CSV exports.
- **People:** CSV import of people, temporary passwords, a forced password change and login rate limiting.

---

## 1. Run it on your computer

You need **Node.js 18 or newer** and a MongoDB database. The database can be a local MongoDB or a free Atlas cluster.

### Backend

```bash
cd backend
cp .env.example .env        # then edit MONGODB_URI and JWT_SECRET
npm install
npm run dev                 # API on http://localhost:5000
```

### Frontend

In a second terminal:

```bash
cd frontend
cp .env.example .env        # VITE_API_URL=http://localhost:5000
npm install
npm run dev                 # app on http://localhost:5173
```

Open http://localhost:5173. On a fresh database the **installer** appears: create the first administrator. You can also tick *Load demo data*, which adds 3 departments, 3 teams, 22 people (including 3 applications waiting for review) and 4 BPO courses. All demo accounts use the password `Welcome@123`, for example `trainer@shaggar.test`, `head.cs@shaggar.test` (Department Head), `registrar@shaggar.test`, `hana.tesfaye@shaggar.test` (team lead) and `abebe.kebede@shaggar.test` (student).

You can also do the install from the command line instead of the browser:

```bash
cd backend
npm run seed -- --admin-email=admin@shaggar.com --admin-password='StrongPass#2026' --admin-name="Training Admin" --demo
```

---

## 2. Environment variables

Each half has its own `.env.example` listing everything it needs.

**backend/.env**

| Name | What it is |
|---|---|
| `PORT` | Port the API listens on (hosts usually set it for you) |
| `NODE_ENV` | `development` or `production` |
| `MONGODB_URI` | MongoDB connection string (local or Atlas `mongodb+srv://…`) |
| `JWT_SECRET` | Long random secret for sign-in tokens. **Required in production** |
| `JWT_EXPIRES_IN` | How long a sign-in lasts, e.g. `7d` |
| `CLIENT_URL` | Frontend URL(s) allowed to call the API (CORS), comma-separated, e.g. your Vercel URL |
| `TRUST_PROXY` | `1` behind Render/Railway/Nginx so rate limiting sees real IPs |
| `APP_NAME`, `APP_COMPANY` | Branding on pages and certificates |
| `APP_TIMEZONE` | Time zone for due dates, default `Africa/Addis_Ababa` |
| `MAX_UPLOAD_MB` | Largest lesson file upload, default 200 |
| `LOGIN_MAX_ATTEMPTS` | Failed sign-ins allowed per 15 minutes, default 5 |

**frontend/.env**

| Name | What it is |
|---|---|
| `VITE_API_URL` | Backend address, no trailing slash and no `/api`, e.g. `https://shaggar-lms-api.onrender.com` |
| `VITE_APP_NAME` | Name shown before the API answers |

---

## 3. Deploy

### a) Database: MongoDB Atlas
1. Create a free cluster at https://www.mongodb.com/atlas.
2. **Database Access:** add a user with a password.
3. **Network Access:** allow your API host. `0.0.0.0/0` is fine to start with, because the password still protects the database.
4. Copy the connection string and add the database name, for example `…mongodb.net/shaggar_lms?retryWrites=true&w=majority`.

### b) Backend, for example on Render
1. Push this repository to GitHub.
2. In Render, create a **New → Web Service** from the repo.
   - **Root directory:** `backend`
   - **Build command:** `npm install`
   - **Start command:** `npm start`
3. Add the environment variables from `backend/.env.example`. At minimum set `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET`, `TRUST_PROXY=1` and `CLIENT_URL=https://<your-app>.vercel.app`.
4. When it's live, `https://<your-api>/api/health` should return `{"status":"ok","db":"up"}`.

Railway, Fly.io and a plain VPS work the same way: run `npm start` in `backend/` with those variables set.

### c) Frontend on Vercel
1. In Vercel, choose **Add New → Project** and import the same repo.
2. Set **Root Directory** to `frontend`. Vercel detects Vite: the build command is `npm run build` and the output folder is `dist`.
3. Under **Environment Variables**, add `VITE_API_URL=https://<your-api>`.
4. Deploy, then put the Vercel URL into the backend's `CLIENT_URL` and redeploy the backend.

`frontend/vercel.json` sends every path to `index.html`, so refreshing on a page such as `/courses/123` or `/admin/users` loads the app instead of showing a 404:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

> If you change `VITE_API_URL`, redeploy the frontend. Vite reads it at build time.

---

## 4. Project structure

```
backend/
  src/
    server.js            Starts the API (connects to MongoDB, listens on PORT)
    app.js               Express app: security headers, CORS, routes, error handling
    config.js            Reads .env
    db.js                MongoDB connection + GridFS bucket for lesson files
    models/              Mongoose schemas: User, Team, Course/Module/Lesson, Quiz/Question/QuizAttempt,
                         Enrolment, TeamCourse, LessonProgress, Certificate, LoginAttempt
    middleware/auth.js   JWT sign-in, roles, team-lead scoping
    routes/              auth, install, dashboard, learn, quiz, certificates,
                         manage (courses/lessons/enrolment), quizBuilder, admin, reports
    services/            progress (completion & certificates), reports, files (GridFS), content (cascading deletes)
    seed/                Demo data and the command-line installer (npm run seed)
    utils/               dates, CSV, passwords, video links, HTTP helpers
  tests/api.test.js      End-to-end API test suite (npm test)
  .env.example

frontend/
  src/
    main.jsx, App.jsx    Entry point and routes (with sign-in and role guards)
    lib/                 API client, auth context, flash messages, formatting
    components/          Layout, icons, progress bars, badges, safe lesson-text renderer
    pages/               Learner pages, manage/ (course builder), admin/ (people, teams), reports/
    styles.css           The original stylesheet
  public/favicon.svg
  vercel.json            SPA rewrite so page refreshes work on Vercel
  .env.example
```

### How sign-in works
The API returns a JWT on sign-in. The frontend keeps it in `localStorage` and sends it as `Authorization: Bearer …`. Changing a password or deactivating a person invalidates their old tokens. Lesson files open through short-lived signed links, so `<video>` and PDF previews work across the Vercel and API domains.

### Certificate PDFs
The **Download PDF** button builds an A4 landscape PDF in the browser (html2canvas + jsPDF, loaded only when clicked). Because it uses the device's own fonts, Amharic names come out correctly. **Print** is still there too.

### Lesson files
Uploads (PDF, Word, PowerPoint, Excel, MP4, MP3, images) are stored **inside MongoDB with GridFS**, so they survive redeploys on hosts with temporary disks, such as Render or Railway. Videos are streamed with range requests, so learners can skip ahead.

---

## 5. Database migrations

Existing databases are upgraded automatically when the API starts (and by `npm run seed`). The step is additive and idempotent: existing students are recorded as *approved (legacy)* so nobody loses access, existing certificates are marked *issued*, account status mirrors the old active flag, and a settings document is created. Nothing is deleted.

```bash
cd backend
npm run migrate          # apply pending migrations by hand
npm run migrate:status   # list applied migrations
npm run migrate:down     # roll back the latest one (take a mongodump backup first)
```

## 6. Tests

With a MongoDB available:

```bash
cd backend
npm test
```

The test suite creates a temporary database (your `MONGODB_URI` name + `_test`, or `MONGODB_TEST_URI`), installs the demo data and starts the API. It then runs about 190 end-to-end checks across every role: learning, quizzes, certificates, course building, uploads, enrolment, reports, CSV import and export, permissions and rate limiting, plus registration and approval, department scoping, registrar limits, administrator overrides, certificate authorisation, logo upload and placements, the audit log, account suspension and the migration. The database is dropped at the end.

## 7. Backups
- **Atlas:** turn on backups in the cluster settings.
- **Self-hosted:** `mongodump --uri="$MONGODB_URI" --out=backup-$(date +%F)`. Lesson files are in the `lessonFiles.*` collections, logos and signatures in `brandingFiles.*`, and student documents in `registrationFiles.*`, so they're all included.


## Connection with the Shaggar BPO Talent Pool (optional)

The Talent Pool can enrol approved talents in published courses here, and shows them as "Under training" until they finish.

- Set `INTEGRATION_KEY` (the same long random key as on the Talent Pool server) and `TALENT_POOL_URL` (the Talent Pool API address). Optional: `TALENT_POOL_DEPARTMENT`, a department code for the new learners.
- New learners are created as approved students (source "Talent Pool") with a temporary password they change at first sign-in. Existing accounts (same email) are simply enrolled.
- Progress, completion, certificate approval/revocation and the first sign-in are reported back to the Talent Pool automatically.
- API (server to server, header `X-Integration-Key`): `GET /api/integration/ping`, `GET /api/integration/courses`, `POST /api/integration/enrol`, `GET /api/integration/status?email=`, `POST /api/integration/new-password`. Without `INTEGRATION_KEY` these addresses do not exist.
