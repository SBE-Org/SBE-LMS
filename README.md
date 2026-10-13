# Shaggar BPO Academy

A training platform (LMS) built for **Shaggar BPO Enterprise**: onboard new agents, run product and compliance training, test knowledge with quizzes, issue certificates and give team leads live progress reports.

Plain **PHP 8.1+** with **MySQL / MariaDB** (or SQLite for a quick trial). No frameworks and no Composer packages, so it runs on XAMPP, any Linux server or ordinary shared hosting, and any PHP developer can maintain it.

---

## What it does

| Area | Features |
|---|---|
| **Courses & lessons** | Courses → modules → lessons. Lesson types: reading (simple formatting), video (YouTube / Vimeo link or uploaded MP4), document (PDF shown in the page; Word, PowerPoint, Excel, audio, images). Drafts, publishing, archiving, reordering. Courses can be assigned or “open to everyone”. |
| **Quizzes & certification** | Single-answer, multiple-answer and true/false questions with points and explanations. Pass mark, time limit (auto-submits), attempt limit, shuffled order, optional answer review. A course is complete when every lesson is done and every quiz passed; a certificate with a unique number is then issued, printable as PDF and checkable on a public verification page. |
| **Progress & reports** | Dashboard KPIs, completion by course and by team, learner list (overdue first), per-learner history, per-course learner table, quiz question analysis (which questions people get wrong), CSV export of progress and quiz results. |
| **Roles & enrolment** | Four roles: Agent, Team Lead, Trainer, Administrator. Teams (by campaign). Enrol individuals or whole teams with due dates; people who join a team later are enrolled automatically. CSV import of whole training batches with generated temporary passwords; forced password change on first sign-in. |

### Who can do what

| | Agent | Team Lead | Trainer | Admin |
|---|:-:|:-:|:-:|:-:|
| Take courses and quizzes, earn certificates | ✓ | ✓ | ✓ | ✓ |
| Reports for the teams they lead | | ✓ | | |
| Reports for everyone | | | ✓ | ✓ |
| Build courses, quizzes; enrol people and teams | | | ✓ | ✓ |
| Manage people and teams | | | | ✓ |

---

## Try it in one minute (no database server needed)

Requires PHP 8.1 or newer with the `pdo_sqlite` extension (included with XAMPP and most PHP installs).

```bash
cd shaggar-lms
cp backend/config/config.example.php backend/config/config.php
#   edit backend/config/config.php and set  'driver' => 'sqlite'
php -S localhost:8000 -t frontend/public frontend/public/index.php
```

Open <http://localhost:8000>. The installer asks for the administrator account; tick **Load demo data** to get 3 teams, 16 people and 4 BPO courses with quizzes and realistic progress. All demo accounts use the password **`Welcome@123`**:

| Role | Email |
|---|---|
| Trainer | `trainer@shaggar.test` |
| Team Lead (Inbound) | `hana.tesfaye@shaggar.test` |
| Team Lead (Outbound Sales) | `dawit.bekele@shaggar.test` |
| Agent | `abebe.kebede@shaggar.test` |

---

## Install for real use

### Option A — Windows PC or office server with XAMPP

1. Install [XAMPP](https://www.apachefriends.org) (PHP 8.1 or newer). Start **Apache** and **MySQL**.
2. Copy the `shaggar-lms` folder into `C:\xampp\htdocs\`.
3. Open <http://localhost/phpmyadmin> → **SQL** tab → paste and run `backend/database/create_database.sql` (change the password in it first).
4. Copy `backend/config/config.example.php` to `backend/config/config.php` and set:
   ```php
   'db' => ['driver' => 'mysql', 'host' => '127.0.0.1', 'port' => 3306,
            'name' => 'shaggar_lms', 'user' => 'shaggar', 'pass' => 'your-password', ...],
   ```
5. For video uploads, raise the limits in `C:\xampp\php\php.ini`:
   `upload_max_filesize = 200M` and `post_max_size = 210M`, then restart Apache.
6. Open <http://localhost/shaggar-lms/> and complete the installer.

Other computers on the office network can then use `http://<server-ip>/shaggar-lms/`.

### Option B — Linux server (Ubuntu + Apache or Nginx)

```bash
sudo apt install apache2 mariadb-server php php-mysql php-mbstring php-intl
sudo mysql < backend/database/create_database.sql        # after changing the password
sudo cp -r shaggar-lms /var/www/
sudo chown -R www-data:www-data /var/www/shaggar-lms/backend/storage
cp /var/www/shaggar-lms/backend/config/config.example.php /var/www/shaggar-lms/backend/config/config.php   # then edit it
```

Point the web server's document root at **`/var/www/shaggar-lms/frontend/public`** (only this folder should be public).

- **Apache:** enable `mod_rewrite` (`sudo a2enmod rewrite`) and `AllowOverride All` for that folder; `frontend/public/.htaccess` does the rest.
- **Nginx:**
  ```nginx
  root /var/www/shaggar-lms/frontend/public;
  client_max_body_size 210m;
  location / { try_files $uri /index.php?$query_string; }
  location ~ \.php$ { include snippets/fastcgi-php.conf; fastcgi_pass unix:/run/php/php8.3-fpm.sock; }
  ```

Or install from the command line instead of the web installer:

```bash
php backend/bin/install.php --admin-email=admin@shaggar.com --admin-password='StrongPass#2026' --admin-name="Training Admin"
```

Use HTTPS in production (for example with Let's Encrypt / certbot).

### Option C — Docker

```bash
docker compose up -d      # edit the passwords in docker-compose.yml first
```

Open <http://localhost:8080>. Uploaded files and the database are kept in Docker volumes.

### Shared hosting (cPanel)

Upload the folder, create the database and user in cPanel, edit `backend/config/config.php`. If you can't point the domain at `frontend/public/`, the `.htaccess` in the project root forwards requests there and blocks the other folders.

---

## Configuration

Everything is in `backend/config/config.php` (each value can also be set with the environment variable named next to it):

| Setting | Meaning |
|---|---|
| `app_name`, `company` | Names shown in the interface and on certificates |
| `base_url` | Leave empty (auto-detected). Set only if links come out wrong, e.g. `'/shaggar-lms/frontend/public'` |
| `db` | Database connection (`mysql` or `sqlite`) |
| `uploads_dir`, `max_upload_mb` | Where lesson files are stored (outside the web root) and the size limit |
| `login_max_attempts` | Failed sign-ins allowed per email + IP within 15 minutes |
| `debug` | `true` shows error details. Keep `false` in production |

## Backups

Back up two things every day:
1. The database: `mysqldump shaggar_lms > backup-$(date +%F).sql`
2. The uploads folder: `backend/storage/uploads/`

---

## Security

- Passwords are hashed with PHP's `password_hash` (bcrypt); temporary passwords must be changed at first sign-in.
- Every form is protected against CSRF; all database queries are prepared statements; all output is escaped.
- Lesson text supports a safe formatting subset only — HTML and scripts typed by trainers are shown as text.
- Uploaded files get random names, are limited to an allow-list of types, are stored outside the web root and are served only to enrolled learners and staff.
- Sign-in is rate-limited; sessions use HTTP-only, SameSite cookies (and Secure on HTTPS).
- Team leads only see their own teams; agents only see their own results and certificates.

---

## Project structure

```
frontend/                  Everything the browser sees
  public/                  Web root — the only folder that should be public
    index.php              Entry point (loads the backend and dispatches the request)
    .htaccess              Sends every non-file request to index.php
    assets/                app.css, app.js, favicon.svg
  views/                   PHP templates (layout.php wraps every page)
    admin/ manage/ reports/

backend/                   Server-side application — never publicly served
  app/
    bootstrap.php          Loads config, helpers and the class autoloader
    dispatch.php           Matches the request to a route and runs the controller
    Controllers/           One class per area: Learn, Quiz, Manage, QuizBuilder, Admin, Report, ...
    Progress.php           Progress, completion and certificate rules
    DB.php                 Database helper (MySQL and SQLite)
    helpers.php            Escaping, sessions, CSRF, uploads, formatting, view rendering
  routes.php               URL → controller table
  config/                  config.example.php (copy to config.php)
  database/                schema.php (tables), seed.php (demo content), create_database.sql
  bin/install.php          Command-line installer
  storage/                 Uploaded files (and the SQLite file in trial mode)

tests/                     End-to-end test suite
```

**Adding a page:** add a route in `backend/routes.php`, a method in a controller (`backend/app/Controllers/`), and a template in `frontend/views/`.
**Changing the colours:** edit the variables at the top of `frontend/public/assets/app.css`.

## Tests

```bash
bash tests/run.sh
```

Installs a fresh SQLite database with demo data, starts PHP's built-in server and runs 94 end-to-end checks covering every role: learning, quizzes, certificates, course building, uploads, enrolment, reports, CSV import/export, permissions, CSRF and rate limiting. To test against MySQL, set the `DB_*` environment variables to an empty test database and run the three commands at the top of `tests/http_test.php`.

## Ideas for next steps

- Email or SMS reminders for due and overdue training
- Amharic (and Afaan Oromo) interface translation — content can already be written in any language
- Question banks with random selection, and free-text questions marked by trainers
- Call-recording assessments: trainers score an agent's real call against a checklist
- SCORM package import for bought-in courses
- Single sign-on with the company's Microsoft 365 or Google accounts
