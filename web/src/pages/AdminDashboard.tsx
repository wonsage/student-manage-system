import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Spinner, Empty } from "../components/ui";
import type { Student } from "../types";
import { STATUS_LABELS, FOLLOWUP_TYPE_LABELS } from "../types";

type FollowUps = {
  pendingTrial: { id: string; name: string; status: string; level?: string | null }[];
  lowCredits: { id: string; name: string; status: string; level?: string | null; remainingCredits: number }[];
  dueFollowUps: { id: string; studentId: string; studentName: string; studentStatus: string; type: string; content: string; nextFollowUpAt: string | null }[];
};

export function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<{
    myStudents: number;
    pendingTrial: number;
    lowCredits: number;
    newThisWeek: number;
  } | null>(null);
  const [students, setStudents] = useState<Student[] | null>(null);
  const [followUps, setFollowUps] = useState<FollowUps | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.dashboard(), api.students({ scope: "mine" }), api.followups()])
      .then(([d, s, f]) => {
        setStats(d.stats);
        setStudents(s.students);
        setFollowUps(f);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;

  const totalFollowUps = followUps
    ? followUps.pendingTrial.length + followUps.lowCredits.length + followUps.dueFollowUps.length
    : 0;

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
            <Link to="/students?status=TRIAL_DONE" className="stat-card">
              <div className="num">{stats.pendingTrial}</div>
              <div className="label">待跟进试听</div>
            </Link>
            <Link to="/students?status=LOW_CREDITS" className="stat-card">
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
              <h3 style={{ margin: 0 }}>今日待跟进</h3>
              <span className="muted small">{totalFollowUps} 项</span>
            </div>
            {!followUps ? (
              <Spinner />
            ) : totalFollowUps === 0 ? (
              <Empty text="今日没有待跟进事项 🎉" />
            ) : (
              <div>
                {followUps.pendingTrial.length > 0 && (
                  <div className="follow-group">
                    <div className="small muted follow-title">待跟进试听</div>
                    {followUps.pendingTrial.map((s) => (
                      <div key={s.id} className="flex between follow-row">
                        <Link to={`/students/${s.id}`}>{s.name}</Link>
                        <span className="badge TRIAL_DONE">
                          {STATUS_LABELS[s.status as keyof typeof STATUS_LABELS]}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {followUps.lowCredits.length > 0 && (
                  <div className="follow-group">
                    <div className="small muted follow-title">快用完课时（需续费）</div>
                    {followUps.lowCredits.map((s) => (
                      <div key={s.id} className="flex between follow-row">
                        <Link to={`/students/${s.id}`}>{s.name}</Link>
                        <span className="small" style={{ color: "var(--warn)", fontWeight: 600 }}>
                          剩 {s.remainingCredits} 课时
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {followUps.dueFollowUps.length > 0 && (
                  <div className="follow-group">
                    <div className="small muted follow-title">到期跟进</div>
                    {followUps.dueFollowUps.map((f) => (
                      <div key={f.id} className="flex between follow-row">
                        <div>
                          <Link to={`/students/${f.studentId}`}>{f.studentName}</Link>
                          <div className="small muted">
                            {FOLLOWUP_TYPE_LABELS[f.type as keyof typeof FOLLOWUP_TYPE_LABELS]} · {f.content}
                          </div>
                        </div>
                        <span className="small muted">
                          {f.nextFollowUpAt
                            ? new Date(f.nextFollowUpAt).toLocaleDateString("zh-CN")
                            : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
