# v2.1 — Departments, registration approval, roles and branding

This release extends the existing MERN LMS in place. The stack, folder layout, authentication, API style and design are unchanged; no new npm dependencies were added.

## 1. What was already there (inspection)

| Area | Before | Action |
|---|---|---|
| Stack | Express 5 + Mongoose 8 API, React 18 + Vite SPA, GridFS for files | Kept |
| Auth | JWT, bcrypt, forced password change, login rate limiting, token invalidation | Kept; added "suspended" status |
| Roles | admin, trainer, team_lead, agent | Added Department Head and Registrar; `agent` shown as **Student** |
| Organisation | Teams with team leads | Kept; **Departments** added alongside |
| Registration | None (admins created accounts) | Added self-registration, registrar registration and approval workflow |
| Courses, quizzes, enrolment | Complete | Kept; courses can belong to a department; Department Heads scoped to theirs |
| Certificates | Auto-issued on completion, PDF via html2canvas/jsPDF, print, public verify | Kept; branding, signatories, seal, optional authorisation, revocation |
| Dashboards | Learner view and a staff snapshot | Added Administrator, Department Head, Registrar and Student panels |
| Settings / branding | Name from env vars, fixed "S" mark | Branding & settings page with logo placements and live preview |
| Audit, notifications | None | Added audit log and in-app notifications |

## 2. Implemented features

### Roles and permissions (all enforced in the API)
| | Admin | Dept Head | Registrar | Trainer | Team Lead | Student |
|---|---|---|---|---|---|---|
| Manage people, roles, departments, settings, audit log | ✓ | | | | | |
| See registrations | all | own departments | assigned departments (none assigned = all) | | | own |
| Create / correct student registrations | ✓ | | ✓ | | | own (while pending / returned) |
| Approve, reject, request correction | override only (confirmed + reason, audited) | ✓ own departments | only if granted by admin | | | |
| Build courses, quizzes, enrol | all | own departments' courses; approved students of own departments | | all | | |
| Reports | all | own departments | | all | own teams | |
| Authorise certificates | ✓ (and revoke) | own departments | if granted | if granted | | |
| Course content | | | | | | only once registration is **approved** |

- Users cannot raise their own privileges: only administrators edit people; an administrator cannot demote or deactivate themselves; CSV import can no longer create or modify administrator accounts.
- Account status (`active` / `suspended` / `deactivated`), registration approval, course enrolment and course completion are four separate statuses.

### Registration workflow
1. A student registers at `/register`, or a registrar/admin uses **Register a student** — the same form component and the same server-side validation (`services/registration.js`).
2. The application starts as **Pending review**, routed to the Department Head(s) of the chosen department (notification sent). Creating an account never approves it.
3. The Department Head reviews details and documents, then approves, rejects (reason required) or requests a correction (feedback required).
4. The student sees the decision and feedback on the dashboard, on **My registration** and in notifications; a returned application can be corrected and resubmitted.
5. Approval assigns a student ID (`STU-2026-00042`, prefix configurable) unless one was set.
6. Every step is stored in the application history (who, role, when, reason, override flag) and in the audit log.
7. Pending, returned and rejected students are blocked on the server from the catalog, course pages, lessons, lesson files, quizzes, attempts and self-enrolment (`403 REGISTRATION_NOT_APPROVED`).

Form fields: name, email, department and terms are always required; phone, program, training category, date of birth, gender, address, education, qualifications, emergency contact, photo and documents are each **off / optional / required** in Settings. Emails are unique, name + phone duplicates are refused, phones are validated, and documents (PDF/PNG/JPG, 5 MB) are checked by their real content, stored in GridFS and only served to authorised users through authenticated requests.

### Branding, logo and placements
- **Branding & settings** (admins only): institution and platform name, three brand colours with a WCAG contrast check, logo upload (PNG/JPG/SVG ≤ 2 MB) with preview before saving, replace and remove. The current logo stays until the replacement is saved; removing it restores the built-in mark.
- 11 placements, each switched on/off with its own size and alignment: login, registration, navigation header, the four role dashboards, course pages, certificate template, downloadable PDF and printable reports. Options for keeping the aspect ratio and showing the name beside the logo; an optional separate certificate logo.
- Live preview of every placement (including the certificate) with unsaved changes.
- SVGs with scripts, event handlers, embedded content or external links are rejected; logos are served with `Content-Security-Policy: sandbox` and `nosniff`.

### Certificates
- Certificate layout from settings: title, logo position (header / above title / bottom), size and alignment, department name, up to three signatories with signature images, institutional seal; completion and issue dates; unique number; verification URL.
- Separate placement switches for the on-screen/print certificate and the downloaded PDF.
- Per course, **Certificates need authorisation**: completion creates a *pending* certificate that a Department Head (or admin, or a granted user) authorises on **Certificate approvals**. Never more than one certificate per learner and course.
- Administrators can revoke (reason required); the public verify page then says *revoked*. Verification shows only name, course, department and date.

### Dashboards
- Administrator: students, pending registrations, departments, courses, certificates, 6-month registration trend, per-department table, recent audit activity.
- Department Head: pending applications, approved/returned/rejected counts, quiz results, certificates to authorise, department courses with completion.
- Registrar: new accounts (30 days), pending reviews, incomplete/returned applications, recently created records.
- Student: registration status and feedback, deadlines in the next 14 days, recent results, pending certificates, plus the existing learning view.

## 3. Files

**New — backend:** `models/Department.js`, `models/Settings.js`, `models/AuditLog.js`, `models/Notification.js`, `models/Counter.js`, `services/registration.js`, `services/settings.js`, `services/audit.js`, `services/notify.js`, `services/courseAccess.js`, `routes/registrations.js`, `routes/settings.js`, `routes/notifications.js`, `migrations/index.js`, `migrations/cli.js`.

**New — frontend:** `components/Logo.jsx`, `components/RegistrationForm.jsx`, `components/CertificateView.jsx`, `components/Notifications.jsx`, `pages/Register.jsx`, `pages/MyRegistration.jsx`, `pages/registrations/{Applications,Application,StudentForm}.jsx`, `pages/admin/{Departments,DepartmentForm,Settings,Audit}.jsx`, `pages/manage/CertificateApprovals.jsx`.

**Modified — backend:** `app.js`, `db.js`, `middleware/auth.js`, `models/{User,Course,Enrolment,index}.js`, `routes/{auth,admin,certificates,dashboard,learn,manage,quiz,quizBuilder,reports}.js`, `services/{files,progress,reports}.js`, `seed/{demoData,seed}.js`, `tests/api.test.js`, `package.json`.

**Modified — frontend:** `App.jsx`, `styles.css`, `lib/{api,auth,format,certificatePdf}.js(x)`, `components/{Layout,AuthLayout,ui,Icon}.jsx`, `pages/{Dashboard,Login,Course,Certificate,Certificates,Verify}.jsx`, `pages/admin/{UserForm,Users,Import}.jsx`, `pages/manage/{CourseForm,Courses,Enrolments}.jsx`, `pages/reports/{Overview,CourseReport,LearnerReport}.jsx`.

## 4. Database changes

All additive; nothing is dropped or renamed.

- `users`: `accountStatus`, `department`, `departments[]`, `permissions.{approveRegistrations,authorizeCertificates}`, `phone`, `profile.*`, `registration.{status,source,submittedAt,createdBy,reviewedBy,reviewedAt,reason,termsAcceptedAt,documents[],history[]}`; roles `department_head` and `registrar` added to the enum.
- `courses`: `department`, `certificateRequiresApproval`.
- `certificates`: `status` (issued / pending / revoked), `completedAt`, `authorizedBy/At`, `revokedBy/At/Reason`. Records without a status count as issued.
- New collections: `departments`, `settings`, `auditlogs`, `notifications`, `counters`, `migrations`; GridFS buckets `brandingFiles`, `registrationFiles`.
- Migration `2026-10-roles-registration-branding` runs on start-up (or `npm run migrate`): existing students → approved (source *legacy*, with a history entry), account status from `active`, existing certificates → issued, default settings. `npm run migrate:down` reverses exactly those changes (new roles map back to Team Lead / deactivated Student; pending and revoked certificates are removed) — back up first.

## 5. Tests and known limitations

- `backend/tests/api.test.js` now also covers: demo data, self-registration validation and storage, duplicate prevention, fake-file rejection, every direct-URL/API bypass for pending students, registrar create/edit/export and approval refusal, same validation for both forms, Department Head scoping (applications, courses, quizzes, enrolment, reports), correction → resubmission → approval with student ID and history, admin override rules, certificate authorisation and verification, logo upload/replace/remove and placement persistence, SVG/fake-image rejection, signatories, audit log access, suspension, privilege escalation, and the migration (including idempotency).
- **Not yet run.** The build environment used for these changes had no access to the npm registry or a MongoDB server, so the code was syntax-checked, linted for undefined names and broken imports, and reviewed, but `npm test` and `npm run build` have not been executed. Please run both before deploying (see below).
- Notifications are in-app only (no e-mail or SMS service exists in the project).
- Verification works by certificate number and URL; no QR code is drawn, to avoid adding a dependency.
- Instructors per course are not assigned separately: the existing Trainer role builds all courses, and Department Heads build their departments' courses.
- Team-based enrolment remains available to administrators and trainers; Department Heads enrol individual approved students of their departments.
- Settings are cached for up to 30 seconds per API instance; with several instances, other instances pick up a change within that time.

## 6. Setup after upgrading

```bash
cd backend && npm install && npm test        # needs MongoDB (MONGODB_URI or MONGODB_TEST_URI)
npm start                                     # applies the migration automatically
cd ../frontend && npm install && npm run build
```

Then, signed in as an administrator:
1. **Departments** → create your departments (and their programs).
2. **People** → set Department Heads (tick their departments) and Registrars; optionally grant registrars approval or certificate permissions.
3. **Branding & settings** → upload the logo, choose placements, colours, certificate signatories/seal and the registration fields.
4. Assign existing courses to departments where relevant, and switch on *Certificates need authorisation* where your institution requires it.
5. Existing students without a department can be given one on the People page.

## Talent Pool connection
- New `/api/integration` API for the Shaggar BPO Talent Pool (list published courses, enrol by email creating an approved student with a temporary password, training status, new temporary password).
- Enrolments made by the Talent Pool are marked (`via: talent_pool`); lesson/quiz progress, completion, certificate authorisation/revocation and a learner's first sign-in are reported back to the Talent Pool.
- New registration source "Talent Pool". New settings: `INTEGRATION_KEY`, `TALENT_POOL_URL`, `TALENT_POOL_DEPARTMENT`.
