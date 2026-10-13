<?php
declare(strict_types=1);

/**
 * URL routes: [HTTP method, path pattern, [Controller, method]].
 * {name} segments are passed to the controller method as arguments.
 */

use App\Controllers\{AuthController, DashboardController, LearnController, QuizController,
    CertificateController, ManageController, QuizBuilderController, AdminController, ReportController, InstallController};

return [
    // Installation (works only before the first user exists)
    ['GET',  '/install', [InstallController::class, 'form']],
    ['POST', '/install', [InstallController::class, 'run']],

    // Sign in
    ['GET',  '/login', [AuthController::class, 'loginForm']],
    ['POST', '/login', [AuthController::class, 'login']],
    ['POST', '/logout', [AuthController::class, 'logout']],
    ['GET',  '/account/password', [AuthController::class, 'passwordForm']],
    ['POST', '/account/password', [AuthController::class, 'password']],

    // Learning
    ['GET',  '/', [DashboardController::class, 'index']],
    ['GET',  '/courses', [LearnController::class, 'catalog']],
    ['GET',  '/courses/{id}', [LearnController::class, 'course']],
    ['POST', '/courses/{id}/enrol', [LearnController::class, 'selfEnrol']],
    ['GET',  '/lessons/{id}', [LearnController::class, 'lesson']],
    ['POST', '/lessons/{id}/complete', [LearnController::class, 'complete']],
    ['GET',  '/lessons/{id}/file', [LearnController::class, 'file']],

    // Quizzes
    ['GET',  '/quizzes/{id}', [QuizController::class, 'intro']],
    ['POST', '/quizzes/{id}/start', [QuizController::class, 'start']],
    ['GET',  '/attempts/{id}', [QuizController::class, 'take']],
    ['POST', '/attempts/{id}', [QuizController::class, 'submit']],
    ['GET',  '/attempts/{id}/result', [QuizController::class, 'result']],

    // Certificates
    ['GET',  '/certificates', [CertificateController::class, 'mine']],
    ['GET',  '/certificates/{code}', [CertificateController::class, 'show']],
    ['GET',  '/verify', [CertificateController::class, 'verify']],

    // Course management (admin, trainer)
    ['GET',  '/manage/courses', [ManageController::class, 'courses']],
    ['GET',  '/manage/courses/new', [ManageController::class, 'courseForm']],
    ['POST', '/manage/courses/new', [ManageController::class, 'courseSave']],
    ['GET',  '/manage/courses/{id}', [ManageController::class, 'builder']],
    ['GET',  '/manage/courses/{id}/edit', [ManageController::class, 'courseForm']],
    ['POST', '/manage/courses/{id}/edit', [ManageController::class, 'courseSave']],
    ['POST', '/manage/courses/{id}/delete', [ManageController::class, 'courseDelete']],
    ['POST', '/manage/courses/{id}/modules', [ManageController::class, 'moduleAdd']],
    ['POST', '/manage/modules/{id}/edit', [ManageController::class, 'moduleRename']],
    ['POST', '/manage/modules/{id}/delete', [ManageController::class, 'moduleDelete']],
    ['POST', '/manage/modules/{id}/move', [ManageController::class, 'moduleMove']],
    ['GET',  '/manage/modules/{id}/lessons/new', [ManageController::class, 'lessonForm']],
    ['POST', '/manage/modules/{id}/lessons/new', [ManageController::class, 'lessonSave']],
    ['GET',  '/manage/lessons/{id}/edit', [ManageController::class, 'lessonForm']],
    ['POST', '/manage/lessons/{id}/edit', [ManageController::class, 'lessonSave']],
    ['POST', '/manage/lessons/{id}/delete', [ManageController::class, 'lessonDelete']],
    ['POST', '/manage/lessons/{id}/move', [ManageController::class, 'lessonMove']],
    ['GET',  '/manage/courses/{id}/enrolments', [ManageController::class, 'enrolments']],
    ['POST', '/manage/courses/{id}/enrolments', [ManageController::class, 'enrolSave']],
    ['POST', '/manage/enrolments/{id}/delete', [ManageController::class, 'enrolDelete']],
    ['POST', '/manage/team-courses/{id}/delete', [ManageController::class, 'teamCourseDelete']],

    // Quiz builder (admin, trainer)
    ['GET',  '/manage/courses/{id}/quizzes/new', [QuizBuilderController::class, 'quizForm']],
    ['POST', '/manage/courses/{id}/quizzes/new', [QuizBuilderController::class, 'quizSave']],
    ['GET',  '/manage/quizzes/{id}', [QuizBuilderController::class, 'quiz']],
    ['GET',  '/manage/quizzes/{id}/edit', [QuizBuilderController::class, 'quizForm']],
    ['POST', '/manage/quizzes/{id}/edit', [QuizBuilderController::class, 'quizSave']],
    ['POST', '/manage/quizzes/{id}/delete', [QuizBuilderController::class, 'quizDelete']],
    ['GET',  '/manage/quizzes/{id}/questions/new', [QuizBuilderController::class, 'questionForm']],
    ['POST', '/manage/quizzes/{id}/questions/new', [QuizBuilderController::class, 'questionSave']],
    ['GET',  '/manage/questions/{id}/edit', [QuizBuilderController::class, 'questionForm']],
    ['POST', '/manage/questions/{id}/edit', [QuizBuilderController::class, 'questionSave']],
    ['POST', '/manage/questions/{id}/delete', [QuizBuilderController::class, 'questionDelete']],

    // People (admin)
    ['GET',  '/admin/users', [AdminController::class, 'users']],
    ['GET',  '/admin/users/new', [AdminController::class, 'userForm']],
    ['POST', '/admin/users/new', [AdminController::class, 'userSave']],
    ['GET',  '/admin/users/import', [AdminController::class, 'importForm']],
    ['POST', '/admin/users/import', [AdminController::class, 'import']],
    ['GET',  '/admin/users/{id}/edit', [AdminController::class, 'userForm']],
    ['POST', '/admin/users/{id}/edit', [AdminController::class, 'userSave']],
    ['GET',  '/admin/teams', [AdminController::class, 'teams']],
    ['GET',  '/admin/teams/new', [AdminController::class, 'teamForm']],
    ['POST', '/admin/teams/new', [AdminController::class, 'teamSave']],
    ['GET',  '/admin/teams/{id}/edit', [AdminController::class, 'teamForm']],
    ['POST', '/admin/teams/{id}/edit', [AdminController::class, 'teamSave']],
    ['POST', '/admin/teams/{id}/delete', [AdminController::class, 'teamDelete']],

    // Reports (admin, trainer, team lead)
    ['GET',  '/reports', [ReportController::class, 'overview']],
    ['GET',  '/reports/courses/{id}', [ReportController::class, 'course']],
    ['GET',  '/reports/users/{id}', [ReportController::class, 'learner']],
    ['GET',  '/reports/quizzes/{id}', [ReportController::class, 'quiz']],
    ['GET',  '/reports/export', [ReportController::class, 'export']],
];
