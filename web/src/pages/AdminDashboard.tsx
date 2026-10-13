import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Spinner, Empty, Avatar } from "../components/ui";
import { LineChart, BarChart, DonutChart } from "../components/charts";
import type { DashboardData, LessonSummary, Student } from "../types";
import { STATUS_LABELS, FOLLOWUP_TYPE_LABELS } from "../types";
import { addDays, fmtMD, weekdayName } from "../theme";

type FollowUps = {
  pendingTrial: { id: string; name: string; status: string; level?: string | null }[];
  lowCredits: { id: string; name: string; status: string; level?: string | null; remainingCredits: number }[];
  dueFollowUps: { id: string; studentId: string; studentName: string; studentStatus: string; type: string; content: string; nextFollowUpAt: string | null }[];
};

const STATUS_COLORS: Record<string, string> = {
  ENROLLED: "#16a34a",
  TRIAL_DONE: "#d97706",
  TRIAL_SCHEDULED: "#2563eb",
  LEAD: "#94a3b8",
  CHURNED: "#cbd5e1",
};

function StatCard({
  icon,
  color,
  num,
  label,
  hint,
  to,
}: {
  icon: string;
  color: string;
  num: number | string;
  label: string;
  hint?: string;
  to: string;
}) {
  return (
    <Link to={to} className="stat-card">
      <span className="accent-bar" style={{ background: color }} />
      <div className="stat-top">
        <span className="stat-ico" style={{ background: `${color}1a`, color }}>{icon}</span>
      </div>
      <div className="num">{num}</div>
      <div className="label">{label}</div>
      {hint && <div className="tiny muted" style={{ marginTop: 4 }}>{hint}</div>}
    </Link>
  );
}

export function AdminDashboard() {
  const { user } = useAuth();
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [followUps, setFollowUps] = useState<FollowUps | null>(null);
  const [weekLessons, setWeekLessons] = useState<LessonSummary[] | null>(null);
  const [students, setStudents] = useState<Student[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.dashboard(), api.followups(), api.students({ scope: "mine" })])
      .then(async ([d, f, s]) => {
        setDash(d);
        setFollowUps(f);
        setStudents(s.students);
        const r = await api.lessonsRange(d.today, addDays(d.today, 6));
        setWeekLessons(r.lessons);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!dash) return <Spinner />;

  const totalFollowUps = followUps
    ? followUps.pendingTrial.length + followUps.lowCredits.length + followUps.dueFollowUps.length
    : 0;

  const statusSegments = dash.statusDistribution.map((s) => ({
    label: STATUS_LABELS[s.status as keyof typeof STATUS_LABELS] ?? s.status,
    value: s.count,
    color: STATUS_COLORS[s.status] ?? "#cbd5e1",
  }));

  const rate = Math.round(dash.stats.attendanceRate * 100);

  // 未来 7 天课程，按日期分组
  const weekGrouped = (weekLessons ?? []).reduce<Record<string, LessonSummary[]>>((acc, l) => {
    (acc[l.date] ??= []).push(l);
    return acc;
  }, {});
  const weekDates = Object.keys(weekGrouped).sort();

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>你好，{user?.name} 👋</h1>
          <div className="sub">
            今天有 <b>{totalFollowUps}</b> 项待跟进 · 未来 7 天共 <b>{weekLessons?.length ?? 0}</b> 节课
          </div>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <StatCard icon="👥" color="#2563eb" num={dash.stats.myStudents} label="我的学生" hint={`已报名 ${dash.stats.enrolled} 人`} to="/students" />
        <StatCard icon="✅" color="#16a34a" num={dash.stats.enrolled} label="已报名" hint="在读正式学员" to="/students?status=ENROLLED" />
        <StatCard icon="📞" color="#d97706" num={dash.stats.pendingTrial} label="待跟进试听" hint="试听完待回访" to="/students?status=TRIAL_DONE" />
        <StatCard icon="⏰" color="#dc2626" num={dash.stats.lowCredits} label="快用完课时" hint="余额 ≤ 2 需续费" to="/students?status=LOW_CREDITS" />
        <StatCard icon="✨" color="#7c3aed" num={dash.stats.newThisWeek} label="本周新报名" hint="近 7 天新增" to="/students" />
        <StatCard icon="🎓" color="#0891b2" num={dash.stats.totalCredits} label="剩余课时池" hint="名下学员课时合计" to="/students" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 18, alignItems: "start" }}>
        <div>
          <div className="card">
            <div className="card-head">
              <h3>📈 报名趋势（近 14 天）</h3>
              <span className="tiny muted">新增线索/学员</span>
            </div>
            <LineChart data={dash.enrollmentTrend.map((p) => ({ label: p.date, value: p.count }))} color="#2563eb" />
          </div>
          <div className="card" style={{ marginTop: 18 }}>
            <div className="card-head">
              <h3>🔥 课时消耗（近 14 天）</h3>
              <span className="tiny muted">每日扣课时数</span>
            </div>
            <BarChart data={dash.creditConsumption.map((p) => ({ label: p.date, value: p.count }))} color="#7c3aed" />
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-head">
              <h3>学生状态分布</h3>
            </div>
            <DonutChart segments={statusSegments} centerValue={String(dash.stats.myStudents)} centerLabel="总学生数" />
          </div>
          <div className="card" style={{ marginTop: 18 }}>
            <div className="card-head">
              <h3>出勤率</h3>
              <span className="tiny muted">近 30 天</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div className="num" style={{ fontSize: "2.4rem", color: rate >= 85 ? "var(--success)" : "var(--warn)" }}>
                {rate}%
              </div>
              <div style={{ flex: 1 }}>
                <div className="tiny muted" style={{ marginBottom: 6 }}>
                  出勤 / 总记录
                </div>
                <div className="progress" style={{ height: 10 }}>
                  <span style={{ width: `${rate}%`, background: rate >= 85 ? "var(--success)" : "var(--warn)" }} />
                </div>
                <div className="tiny muted" style={{ marginTop: 6 }}>
                  {rate >= 85 ? "出勤稳定，继续保持" : "建议关注缺勤原因"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-head">
          <h3>🎯 今日待跟进</h3>
          <span className="badge ENROLLED">{totalFollowUps} 项</span>
        </div>
        {!followUps ? (
          <Spinner />
        ) : totalFollowUps === 0 ? (
          <Empty text="今日没有待跟进事项 🎉" />
        ) : (
          <div>
            {followUps.pendingTrial.length > 0 && (
              <div className="follow-group">
                <div className="follow-title">📞 待跟进试听</div>
                {followUps.pendingTrial.map((s) => (
                  <div key={s.id} className="follow-row">
                    <Link to={`/students/${s.id}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar name={s.name} size="sm" />
                      <span>{s.name}</span>
                      <span className="muted small">{s.level ?? ""}</span>
                    </Link>
                    <span className="badge TRIAL_DONE">试听待跟进</span>
                  </div>
                ))}
              </div>
            )}
            {followUps.lowCredits.length > 0 && (
              <div className="follow-group">
                <div className="follow-title">⏰ 快用完课时（需续费）</div>
                {followUps.lowCredits.map((s) => (
                  <div key={s.id} className="follow-row">
                    <Link to={`/students/${s.id}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar name={s.name} size="sm" />
                      <span>{s.name}</span>
                    </Link>
                    <span className="small" style={{ color: "var(--warn)", fontWeight: 700 }}>
                      剩 {s.remainingCredits} 课时
                    </span>
                  </div>
                ))}
              </div>
            )}
            {followUps.dueFollowUps.length > 0 && (
              <div className="follow-group">
                <div className="follow-title">🗓️ 到期跟进</div>
                {followUps.dueFollowUps.map((f) => (
                  <div key={f.id} className="follow-row">
                    <div style={{ minWidth: 0 }}>
                      <Link to={`/students/${f.studentId}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Avatar name={f.studentName} size="sm" />
                        <span>{f.studentName}</span>
                      </Link>
                      <div className="small muted" style={{ paddingLeft: 38 }}>
                        {FOLLOWUP_TYPE_LABELS[f.type as keyof typeof FOLLOWUP_TYPE_LABELS]} · {f.content}
                      </div>
                    </div>
                    <span className="small muted nowrap">
                      {f.nextFollowUpAt ? fmtMD(f.nextFollowUpAt) : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 18, marginTop: 18, alignItems: "start" }}>
        <div className="card">
          <div className="card-head">
            <h3>🗓️ 未来 7 天课程</h3>
            <Link to="/classes" className="small">排课日历 →</Link>
          </div>
          {!weekLessons ? (
            <Spinner />
          ) : weekDates.length === 0 ? (
            <Empty text="未来 7 天暂无课程" />
          ) : (
            weekDates.map((d) => (
              <div key={d} style={{ marginBottom: 14 }}>
                <div className="small strong" style={{ marginBottom: 6 }}>
                  {fmtMD(d)} · {weekdayName(d)}
                </div>
                {weekGrouped[d].map((l) => (
                  <div key={l.id} className="follow-row">
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span className="ev-color" style={{ width: 4, height: 30, borderRadius: 3, background: "#2563eb" }} />
                      <div>
                        <b className="small">{l.class.name}</b>
                        <div className="tiny muted">
                          {l.class.subject ?? ""} · {l.class.startTime}-{l.class.endTime} · {l.class.teacher.name}
                        </div>
                      </div>
                    </div>
                    <span className="tiny muted nowrap">{l.class.memberCount} 人</span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h3>👥 我的学生</h3>
            <Link to="/students" className="small">查看全部 →</Link>
          </div>
          {!students ? (
            <Spinner />
          ) : students.length === 0 ? (
            <Empty text="还没有学生" />
          ) : (
            students.slice(0, 8).map((s) => (
              <div key={s.id} className="follow-row">
                <Link to={`/students/${s.id}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar name={s.name} size="sm" />
                  <div>
                    <div className="small strong">{s.name}</div>
                    <div className="tiny muted">{s.level ?? ""}</div>
                  </div>
                </Link>
                <div style={{ textAlign: "right" }}>
                  <span className={`badge ${s.status}`}>{STATUS_LABELS[s.status]}</span>
                  {s.status === "ENROLLED" && (
                    <div className="tiny muted" style={{ marginTop: 2 }}>
                      剩 {s.remainingCredits} 课时
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
