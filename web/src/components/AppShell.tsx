import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "ADMIN";

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          Austin Education
          <small>学生管理系统</small>
        </div>

        {isAdmin ? (
          <>
            <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
              工作台
            </NavLink>
            <NavLink to="/students" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
              学生管理
            </NavLink>
            <NavLink to="/classes" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
              班级与排课
            </NavLink>
          </>
        ) : (
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            我的课程
          </NavLink>
        )}

        <div className="user-box">
          <div>{user?.name}</div>
          <div className="role">{isAdmin ? "课程顾问" : "老师"}</div>
          <button className="btn small mt-16" onClick={handleLogout}>
            退出登录
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
