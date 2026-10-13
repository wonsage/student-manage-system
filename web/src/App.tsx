import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { Login } from "./pages/Login";
import { AdminDashboard } from "./pages/AdminDashboard";
import { Students } from "./pages/Students";
import { StudentDetail } from "./pages/StudentDetail";
import { Classes } from "./pages/Classes";
import { TeacherDashboard } from "./pages/TeacherDashboard";
import { LessonDetailPage } from "./pages/LessonDetail";
import { AppShell } from "./components/AppShell";

export default function App() {
  const { user } = useAuth();

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  const isAdmin = user.role === "ADMIN";

  return (
    <Routes>
      <Route element={<AppShell />}>
        {isAdmin ? (
          <>
            <Route path="/" element={<AdminDashboard />} />
            <Route path="/students" element={<Students />} />
            <Route path="/students/:id" element={<StudentDetail />} />
            <Route path="/classes" element={<Classes />} />
          </>
        ) : (
          <>
            <Route path="/" element={<TeacherDashboard />} />
            <Route path="/lessons/:id" element={<LessonDetailPage />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
