import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Spinner, Empty } from "../components/ui";
import { Calendar } from "../components/Calendar";
import type { LessonSummary, TeacherOverview } from "../types";
import { subjectColor, fmtMD, weekdayName } from "../theme";

export function TeacherDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<TeacherOverview | null>(null);
  const [todayLessons, setTodayLessons] = useState<LessonSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.teacherOverview(), api.lessons()])
      .then(([ov, l]) => {
        setOverview(ov);
        setTodayLessons(l.lessons);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!overview) return <Spinner />;

  const statCards = [
    { icon: "📖", color: "#2563eb", num: overview.todayCount, label: "今日课程", to: "" },
    { icon: "🗓️", color: "#7c3aed", num: overview.weekCount, label: "未来 7 天课程", to: "" },
    { icon: "👥", color: "#16a34a", num: overview.myStudents, label: "所教学生", to: "" },
    { icon: "⏳", color: "#d97706", num: overview.pendingAttendance, label: "待点名", to: "" },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>你好，{user?.name} 👋</h1>
          <div className="sub">今天是 {fmtMD(overview.today)} · {weekdayName(overview.today)}，祝上课顺利。</div>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        {statCards.map((s) => (
          <div key={s.label} className="stat-card" style={{ cursor: "default" }}>
            <span className="accent-bar" style={{ background: s.color }} />
            <div className="stat-top">
              <span className="stat-ico" style={{ background: `${s.color}1a`, color: s.color }}>{s.icon}</span>
            </div>
            <div className="num">{s.num}</div>
            <div className="label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>📖 今日课程</h3>
          <span className="tiny muted">点进去即可点名记出勤、写反馈</span>
        </div>
        {!todayLessons ? (
          <Spinner />
        ) : todayLessons.length === 0 ? (
          <Empty text="今天没有课程安排" />
        ) : (
          <div>
            {todayLessons.map((l) => {
              const done = l.attendanceCount;
              const total = l.class.memberCount;
              const allDone = total > 0 && done >= total;
              return (
                <Link
                  key={l.id}
                  to={`/lessons/${l.id}`}
                  className="follow-row"
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <span className="ev-color" style={{ width: 5, alignSelf: "stretch", borderRadius: 3, background: subjectColor(l.class.subject) }} />
                  <div style={{ flex: 1 }}>
                    <b>{l.class.name}</b>
                    <div className="small muted">
                      {l.class.subject ?? ""} · {l.class.startTime}-{l.class.endTime} · {total} 人
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span className={`badge ${allDone ? "PRESENT" : "TRIAL_DONE"}`}>
                      {allDone ? "已点名" : `点名 ${done}/${total}`}
                    </span>
                    <div className="tiny muted" style={{ marginTop: 4 }}>进入点名 →</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-head">
          <h3>🗓️ 本周课程表</h3>
          <span className="tiny muted">点击课程块可进入点名</span>
        </div>
        <Calendar onEventClick={(l) => navigate(`/lessons/${l.id}`)} />
      </div>
    </div>
  );
}
