import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { Avatar } from "./ui";

function todayLabel(): { date: string; weekday: string } {
  const d = new Date();
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  const date = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  return { date, weekday: weekdays[d.getDay()] };
}

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "ADMIN";
  const { date, weekday } = todayLabel();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo">AE</span>
          <span>
            <span className="brand-name">Austin Education</span>
            <span className="brand-sub">学生管理系统</span>
          </span>
        </div>

        <div className="nav-label">{isAdmin ? "工作空间" : "教学"}</div>

        {isAdmin ? (
          <>
            <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
              <span className="nav-ico">📊</span> 工作台
            </NavLink>
            <NavLink to="/students" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
              <span className="nav-ico">👥</span> 学生管理
            </NavLink>
            <NavLink to="/classes" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
              <span className="nav-ico">📅</span> 班级与排课
            </NavLink>
          </>
        ) : (
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
            <span className="nav-ico">📖</span> 我的课程
          </NavLink>
        )}

        <div className="spacer" />
        <div className="foot-note">
          当前登录
          <div style={{ color: "#c7d2e0", marginTop: 2 }}>{user?.name}</div>
        </div>
      </aside>

      <div className="main-wrap">
        <header className="topbar">
          <div className="date-cluster">
            <span className="date-main">{date}</span>
            <span className="date-sub">{weekday}</span>
            <span className={`role-tag ${isAdmin ? "admin" : "teacher"}`}>
              {isAdmin ? "课程顾问" : "老师"}
            </span>
          </div>
          <div className="who">
            <Avatar name={user?.name} />
            <div style={{ lineHeight: 1.3 }}>
              <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{user?.name}</div>
              <div className="tiny muted">{user?.email}</div>
            </div>
            <button className="btn small ghost" onClick={handleLogout}>
              退出
            </button>
          </div>
        </header>

        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
