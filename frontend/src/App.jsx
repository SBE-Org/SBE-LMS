import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth, hasRole } from './lib/auth.jsx';
import Layout from './components/Layout.jsx';
import AuthLayout from './components/AuthLayout.jsx';
import { ErrorPage, Loading } from './components/ui.jsx';

import Login from './pages/Login.jsx';
import Install from './pages/Install.jsx';
import Verify from './pages/Verify.jsx';
import Password from './pages/Password.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Catalog from './pages/Catalog.jsx';
import CoursePage from './pages/Course.jsx';
import LessonPage from './pages/Lesson.jsx';
import QuizIntro from './pages/QuizIntro.jsx';
import QuizTake from './pages/QuizTake.jsx';
import QuizResult from './pages/QuizResult.jsx';
import Certificates from './pages/Certificates.jsx';
import CertificatePage from './pages/Certificate.jsx';

import ManageCourses from './pages/manage/Courses.jsx';
import CourseForm from './pages/manage/CourseForm.jsx';
import Builder from './pages/manage/Builder.jsx';
import LessonForm from './pages/manage/LessonForm.jsx';
import QuizForm from './pages/manage/QuizForm.jsx';
import QuizQuestions from './pages/manage/QuizQuestions.jsx';
import QuestionForm from './pages/manage/QuestionForm.jsx';
import Enrolments from './pages/manage/Enrolments.jsx';

import Users from './pages/admin/Users.jsx';
import UserForm from './pages/admin/UserForm.jsx';
import ImportUsers from './pages/admin/Import.jsx';
import Teams from './pages/admin/Teams.jsx';
import TeamForm from './pages/admin/TeamForm.jsx';

import ReportsOverview from './pages/reports/Overview.jsx';
import CourseReport from './pages/reports/CourseReport.jsx';
import QuizReport from './pages/reports/QuizReport.jsx';
import LearnerReport from './pages/reports/LearnerReport.jsx';

/** Signed-in pages. Sends people with a temporary password to the password page first. */
function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (user.mustChangePassword && location.pathname !== '/account/password') {
    return <Navigate to="/account/password" replace />;
  }
  return children;
}

function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (!hasRole(user, ...roles)) return <ErrorPage status={403} message="You do not have permission to open this page." />;
  return children;
}

const staff = (el) => <RequireRole roles={['admin', 'trainer']}>{el}</RequireRole>;
const admin = (el) => <RequireRole roles={['admin']}>{el}</RequireRole>;
const tracker = (el) => <RequireRole roles={['admin', 'trainer', 'team_lead']}>{el}</RequireRole>;

export default function App() {
  const { ready, meta, metaError, user } = useAuth();
  const location = useLocation();

  if (!ready) return <main className="plain"><Loading /></main>;
  if (metaError && metaError.status === 0) {
    return <main className="plain"><ErrorPage status={0} message={metaError.message} /></main>;
  }
  // Fresh database: go to the installer first
  if (!meta.installed && location.pathname !== '/install' && !location.pathname.startsWith('/verify')) {
    return <Navigate to="/install" replace />;
  }

  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/install" element={<Install />} />
        <Route path="/verify" element={<Verify />} />
      </Route>

      <Route path="/certificates/:code" element={<RequireAuth><CertificatePage /></RequireAuth>} />

      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/account/password" element={<Password />} />
        <Route path="/courses" element={<Catalog />} />
        <Route path="/courses/:id" element={<CoursePage />} />
        <Route path="/lessons/:id" element={<LessonPage />} />
        <Route path="/quizzes/:id" element={<QuizIntro />} />
        <Route path="/attempts/:id" element={<QuizTake />} />
        <Route path="/attempts/:id/result" element={<QuizResult />} />
        <Route path="/certificates" element={<Certificates />} />

        <Route path="/manage/courses" element={staff(<ManageCourses />)} />
        <Route path="/manage/courses/new" element={staff(<CourseForm />)} />
        <Route path="/manage/courses/:id" element={staff(<Builder />)} />
        <Route path="/manage/courses/:id/edit" element={staff(<CourseForm />)} />
        <Route path="/manage/courses/:id/enrolments" element={staff(<Enrolments />)} />
        <Route path="/manage/modules/:moduleId/lessons/new" element={staff(<LessonForm />)} />
        <Route path="/manage/lessons/:id/edit" element={staff(<LessonForm />)} />
        <Route path="/manage/courses/:courseId/quizzes/new" element={staff(<QuizForm />)} />
        <Route path="/manage/quizzes/:id" element={staff(<QuizQuestions />)} />
        <Route path="/manage/quizzes/:id/edit" element={staff(<QuizForm />)} />
        <Route path="/manage/quizzes/:quizId/questions/new" element={staff(<QuestionForm />)} />
        <Route path="/manage/questions/:id/edit" element={staff(<QuestionForm />)} />

        <Route path="/admin/users" element={admin(<Users />)} />
        <Route path="/admin/users/new" element={admin(<UserForm />)} />
        <Route path="/admin/users/import" element={admin(<ImportUsers />)} />
        <Route path="/admin/users/:id/edit" element={admin(<UserForm />)} />
        <Route path="/admin/teams" element={admin(<Teams />)} />
        <Route path="/admin/teams/new" element={admin(<TeamForm />)} />
        <Route path="/admin/teams/:id/edit" element={admin(<TeamForm />)} />

        <Route path="/reports" element={tracker(<ReportsOverview />)} />
        <Route path="/reports/courses/:id" element={tracker(<CourseReport />)} />
        <Route path="/reports/quizzes/:id" element={tracker(<QuizReport />)} />
        <Route path="/reports/users/:id" element={tracker(<LearnerReport />)} />

        <Route path="*" element={<ErrorPage status={404} message="We could not find that page." />} />
      </Route>
    </Routes>
  );
}
