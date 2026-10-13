import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Spinner, Empty } from "../components/ui";
import type { Student } from "../types";
import { STATUS_LABELS } from "../types";

export function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<{
    myStudents: number;
    pendingTrial: number;
    lowCredits: number;
    newThisWeek: number;
  } | null>(null);
  const [students, setStudents] = useState<Student[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.dashboard(), api.students({ scope: "mine" })])
      .then(([d, s]) => {
        setStats(d.stats);
        setStudents(s.students);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>你好，{user?.name}</h1>
          <div className="sub">这里是你的学生概览，最关心的数据都在第一屏。</div>
        </div>
      </div>

      {!stats ? (
        <Spinner />
      ) : (
        <>
          <div className="stats-grid">
            <Link to="/students?filter=pendingTrial" className="stat-card">
              <div className="num">{stats.pendingTrial}</div>
              <div className="label">待跟进试听</div>
            </Link>
            <Link to="/students?filter=lowCredits" className="stat-card">
              <div className="num">{stats.lowCredits}</div>
              <div className="label">快用完课时</div>
            </Link>
            <Link to="/students" className="stat-card">
              <div className="num">{stats.myStudents}</div>
              <div className="label">我的学生</div>
            </Link>
            <Link to="/students" className="stat-card">
              <div className="num">{stats.newThisWeek}</div>
              <div className="label">本周新报名</div>
            </Link>
          </div>

          <div className="card">
            <div className="flex between mb-16">
              <h3 style={{ margin: 0 }}>我的学生</h3>
              <Link to="/students" className="btn small">
                查看全部 →
              </Link>
            </div>
            {!students ? (
              <Spinner />
            ) : students.length === 0 ? (
              <Empty text="还没有学生，点击右上角新增" />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>状态</th>
                    <th>剩余课时</th>
                    <th>最近更新</th>
                  </tr>
                </thead>
                <tbody>
                  {students.slice(0, 8).map((s) => (
                    <tr key={s.id} className="row-click">
                      <td>
                        <Link to={`/students/${s.id}`}>{s.name}</Link>
                      </td>
                      <td>
                        <span className={`badge ${s.status}`}>
                          {STATUS_LABELS[s.status]}
                        </span>
                      </td>
                      <td>
                        {s.status === "ENROLLED" ? (
                          <span style={{ color: s.remainingCredits <= 2 ? "var(--warn)" : "var(--ink)" }}>
                            {s.remainingCredits}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="muted small">{new Date(s.updatedAt).toLocaleDateString("zh-CN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
