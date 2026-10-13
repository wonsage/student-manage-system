import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { Spinner, Modal, useToast, Empty, Avatar } from "../components/ui";
import { BarChart, DonutChart } from "../components/charts";
import type { AttendanceRecord, ClassInfo, CreditTransaction, FollowUp, FollowUpType, Student } from "../types";
import { STATUS_LABELS, FOLLOWUP_TYPE_LABELS, CREDIT_TX_LABELS, ATTENDANCE_LABELS } from "../types";
import { WEEKDAY_NAMES, fmtMD } from "../theme";

type DetailStudent = Student & {
  enrollments: {
    id: string;
    creditsTotal: number;
    creditsRemaining: number;
    status: string;
    note?: string | null;
    purchasedAt: string;
  }[];
  memberships: { class: ClassInfo }[];
  feedbacks: { id: string; summary: string; generatedBy: string; lesson: { class: { name: string } } }[];
  followUps: FollowUp[];
  creditTransactions: CreditTransaction[];
  attendances: AttendanceRecord[];
};

const ATT_COLORS: Record<string, string> = {
  PRESENT: "#16a34a",
  ABSENT: "#dc2626",
  LATE: "#d97706",
  EXCUSED: "#64748b",
};

function timeOverlap(aS: string, aE: string, bS: string, bE: string) {
  const toM = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  return toM(aS) < toM(bE) && toM(bS) < toM(aE);
}

export function StudentDetail() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [student, setStudent] = useState<DetailStudent | null>(null);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [error, setError] = useState("");
  const [showEnroll, setShowEnroll] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [credits, setCredits] = useState(20);
  const [followType, setFollowType] = useState<FollowUpType>("CALL");
  const [followContent, setFollowContent] = useState("");
  const [followNextDate, setFollowNextDate] = useState("");

  const load = useCallback(() => {
    if (!id) return;
    setStudent(null);
    Promise.all([api.student(id), api.classes()])
      .then(([s, c]) => {
        setStudent(s.student);
        setClasses(c.classes);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(load, [load]);

  const enroll = async () => {
    try {
      await api.enroll(id!, credits);
      toast("ok", `报名成功，购买 ${credits} 课时`);
      setShowEnroll(false);
      load();
    } catch (e: any) {
      toast("err", e.message);
    }
  };

  const schedule = async (classId: string, className: string) => {
    try {
      await api.addMember(classId, id!);
      toast("ok", `已将学生排进「${className}」`);
      load();
    } catch (e: any) {
      toast("err", e.message);
    }
  };

  const recordFollowUp = async () => {
    if (!followContent.trim()) return;
    try {
      await api.recordFollowUp(id!, {
        type: followType,
        content: followContent.trim(),
        nextFollowUpAt: followNextDate || undefined,
      });
      toast("ok", "已记录跟进");
      setShowFollowUp(false);
      setFollowContent("");
      setFollowNextDate("");
      load();
    } catch (e: any) {
      toast("err", e.message);
    }
  };

  const classStates = useMemo(() => {
    if (!student) return [];
    const myClasses = student.memberships.map((m) => m.class);
    return classes.map((c) => {
      const alreadyIn = myClasses.some((m) => m.id === c.id);
      const full = c.memberCount >= c.capacity;
      const conflict = myClasses.some(
        (m) =>
          m.dayOfWeek === c.dayOfWeek &&
          timeOverlap(m.startTime, m.endTime, c.startTime, c.endTime)
      );
      const canSchedule =
        student.status === "ENROLLED" && student.remainingCredits > 0 && !alreadyIn && !full && !conflict;
      return { c, alreadyIn, full, conflict, canSchedule };
    });
  }, [student, classes]);

  const attendanceStats = useMemo(() => {
    const status: Record<string, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
    const byDate: Record<string, number> = {};
    if (!student) return { status, byDate, total: 0, rate: 0, trend: [] as { label: string; value: number }[] };
    for (const a of student.attendances) {
      status[a.status] = (status[a.status] ?? 0) + 1;
      if (a.status === "PRESENT") byDate[a.lesson.date] = (byDate[a.lesson.date] ?? 0) + 1;
    }
    const total = student.attendances.length;
    const rate = total ? Math.round((status.PRESENT / total) * 100) : 0;
    const dates = Object.keys(byDate).sort().slice(-14);
    const trend = dates.map((d) => ({ label: d, value: byDate[d] }));
    return { status, byDate, total, rate, trend };
  }, [student]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!student) return <Spinner />;

  const purchasedTotal = student.enrollments.reduce((s, e) => s + e.creditsTotal, 0);
  const attDonut = (["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const)
    .filter((k) => attendanceStats.status[k] > 0)
    .map((k) => ({
      label: ATTENDANCE_LABELS[k],
      value: attendanceStats.status[k],
      color: ATT_COLORS[k],
    }));

  return (
    <div>
      {/* 顶部学生卡 */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="flex between wrap" style={{ alignItems: "flex-start" }}>
          <div className="flex" style={{ gap: 16 }}>
            <Avatar name={student.name} size="lg" />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h1 style={{ margin: 0, fontSize: "1.5rem" }}>
                  {student.name}
                  {student.nickname && <span className="muted small" style={{ marginLeft: 8 }}>({student.nickname})</span>}
                </h1>
                <span className={`badge ${student.status}`}>{STATUS_LABELS[student.status]}</span>
              </div>
              <div className="muted small" style={{ marginTop: 4 }}>
                {student.level ?? "—"} · 负责人 {student.admin.name} · 加入于 {new Date(student.createdAt).toLocaleDateString("zh-CN")}
              </div>
            </div>
          </div>
          <div className="flex">
            <button className="btn primary" onClick={() => setShowEnroll(true)}>报名 / 续费</button>
            <button
              className="btn"
              onClick={() => setShowSchedule(true)}
              disabled={student.status !== "ENROLLED"}
            >
              排进班级
            </button>
            <button className="btn" onClick={() => setShowFollowUp(true)}>记录跟进</button>
          </div>
        </div>

        <div className="stats-grid" style={{ marginTop: 20, marginBottom: 0, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <div className="stat-card" style={{ cursor: "default" }}>
            <div className="num" style={{ fontSize: "1.7rem" }}>{student.remainingCredits}</div>
            <div className="label">剩余课时</div>
          </div>
          <div className="stat-card" style={{ cursor: "default" }}>
            <div className="num" style={{ fontSize: "1.7rem" }}>{purchasedTotal}</div>
            <div className="label">累计购买</div>
          </div>
          <div className="stat-card" style={{ cursor: "default" }}>
            <div className="num" style={{ fontSize: "1.7rem" }}>{attendanceStats.status.PRESENT}</div>
            <div className="label">已上课次</div>
          </div>
          <div className="stat-card" style={{ cursor: "default" }}>
            <div className="num" style={{ fontSize: "1.7rem", color: attendanceStats.rate >= 85 ? "var(--success)" : "var(--warn)" }}>
              {attendanceStats.total ? `${attendanceStats.rate}%` : "—"}
            </div>
            <div className="label">出勤率</div>
          </div>
        </div>
      </div>

      {/* 基本信息 + 班级 + 反馈 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
        <div className="card">
          <div className="card-head"><h3>基本信息</h3></div>
          <dl className="kv">
            <dt>学生姓名</dt><dd>{student.name}</dd>
            <dt>年级 / 水平</dt><dd>{student.level || "—"}</dd>
            <dt>家长</dt><dd>{student.guardianName || "—"}</dd>
            <dt>家长电话</dt><dd>{student.guardianPhone || "—"}</dd>
            <dt>备注</dt><dd>{student.note || "—"}</dd>
          </dl>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>所在班级</h3>
            <span className="tiny muted">{student.memberships.length} 个</span>
          </div>
          {student.memberships.length === 0 ? (
            <div className="muted small">尚未排进任何班级</div>
          ) : (
            student.memberships.map((m) => (
              <div key={m.class.id} className="follow-row">
                <div>
                  <b>{m.class.name}</b>
                  <div className="muted small">
                    {m.class.subject ?? ""} · {WEEKDAY_NAMES[m.class.dayOfWeek]} {m.class.startTime}-{m.class.endTime} · {m.class.teacher.name}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 课时账户 + 流水 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 18, alignItems: "start" }}>
        <div className="card">
          <div className="card-head"><h3>课时账户</h3></div>
          {student.enrollments.length === 0 ? (
            <div className="muted small">暂无报名记录</div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>购买时间</th>
                    <th>总课时</th>
                    <th>剩余</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {student.enrollments.map((e) => (
                    <tr key={e.id}>
                      <td className="small">{new Date(e.purchasedAt).toLocaleDateString("zh-CN")}</td>
                      <td>{e.creditsTotal}</td>
                      <td>{e.creditsRemaining}</td>
                      <td><span className={`badge ${e.status}`}>{e.status === "ACTIVE" ? "使用中" : e.status === "EXHAUSTED" ? "已用完" : "已退费"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="card-head" style={{ marginTop: 18 }}><h3>课时流水</h3></div>
          {student.creditTransactions.length === 0 ? (
            <div className="muted small">暂无课时流水</div>
          ) : (
            student.creditTransactions.slice(0, 12).map((tx) => (
              <div key={tx.id} className="ledger-row flex between">
                <div style={{ minWidth: 0 }}>
                  <div className="small">
                    <b>{CREDIT_TX_LABELS[tx.type]}</b>
                    {tx.lesson && <span className="muted"> · {tx.lesson.class.name}</span>}
                  </div>
                  <div className="small muted">
                    {new Date(tx.createdAt).toLocaleDateString("zh-CN")} · 结余 {tx.balanceAfter}
                  </div>
                </div>
                <span className={`ledger-amount ${tx.amount >= 0 ? "pos" : "neg"}`}>
                  {tx.amount >= 0 ? `+${tx.amount}` : tx.amount}
                </span>
              </div>
            ))
          )}
        </div>

        {/* 出勤与消耗 */}
        <div className="card">
          <div className="card-head"><h3>出勤构成</h3><span className="tiny muted">{attendanceStats.total} 条记录</span></div>
          {attendanceStats.total === 0 ? (
            <div className="muted small">暂无出勤记录</div>
          ) : (
            <DonutChart segments={attDonut} centerValue={`${attendanceStats.rate}%`} centerLabel="出勤率" />
          )}
          <div className="card-head" style={{ marginTop: 20 }}><h3>近 14 次出勤扣课</h3></div>
          {attendanceStats.trend.length === 0 ? (
            <div className="muted small">暂无扣课数据</div>
          ) : (
            <BarChart data={attendanceStats.trend} color="#16a34a" height={130} />
          )}
        </div>
      </div>

      {/* 跟进记录 + 课堂反馈 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 18, alignItems: "start" }}>
        <div className="card">
          <div className="card-head"><h3>跟进记录</h3></div>
          {student.followUps.length === 0 ? (
            <div className="muted small">暂无跟进记录，点击右上角「记录跟进」</div>
          ) : (
            <div className="timeline">
              {student.followUps.map((f) => (
                <div key={f.id} className="timeline-item">
                  <div className="flex between">
                    <span className="small"><b>{FOLLOWUP_TYPE_LABELS[f.type]}</b></span>
                    <span className="t-time">{new Date(f.createdAt).toLocaleDateString("zh-CN")}</span>
                  </div>
                  <div className="small">{f.content}</div>
                  {f.nextFollowUpAt && (
                    <div className="small muted">下次跟进：{fmtMD(f.nextFollowUpAt)}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head"><h3>最近课堂反馈</h3></div>
          {student.feedbacks.length === 0 ? (
            <div className="muted small">暂无反馈</div>
          ) : (
            student.feedbacks.map((f) => (
              <div key={f.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                <div className="small muted">
                  {f.lesson.class.name}
                  {f.generatedBy === "LLM" && <span className="badge llm" style={{ marginLeft: 6 }}>AI</span>}
                </div>
                <div className="small">{f.summary}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {showEnroll && (
        <Modal title={`报名 / 续费 — ${student.name}`} onClose={() => setShowEnroll(false)}>
          <div className="field">
            <label>购买课时数（1 节 = 1 课时）</label>
            <input
              className="input"
              type="number"
              min={1}
              max={500}
              value={credits}
              onChange={(e) => setCredits(Number(e.target.value))}
            />
          </div>
          <div className="flex" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setShowEnroll(false)}>取消</button>
            <button className="btn primary" onClick={enroll}>确认购买</button>
          </div>
        </Modal>
      )}

      {showSchedule && (
        <Modal title={`排进班级 — ${student.name}`} onClose={() => setShowSchedule(false)}>
          <div className="muted small mb-16">
            已过滤：时间冲突、已满、已报名状态。服务端会再次强制校验。
          </div>
          {classStates.length === 0 ? (
            <Empty text="暂无班级" />
          ) : (
            <div>
              {classStates.map(({ c, alreadyIn, full, conflict, canSchedule }) => (
                <div key={c.id} className="flex between" style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                  <div>
                    <b>{c.name}</b>
                    <div className="muted small">
                      {WEEKDAY_NAMES[c.dayOfWeek]} {c.startTime}-{c.endTime} · {c.teacher.name} · {c.memberCount}/{c.capacity} 人
                    </div>
                    {conflict && <div className="small" style={{ color: "var(--danger)" }}>⚠ 与学生已有班级时间冲突</div>}
                    {alreadyIn && <div className="small muted">✓ 已在班内</div>}
                    {full && <div className="small" style={{ color: "var(--warn)" }}>已满</div>}
                  </div>
                  <button className="btn small primary" disabled={!canSchedule} onClick={() => schedule(c.id, c.name)}>
                    {alreadyIn ? "已加入" : "加入"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {showFollowUp && (
        <Modal title={`记录跟进 — ${student.name}`} onClose={() => setShowFollowUp(false)}>
          <div className="field">
            <label>跟进方式</label>
            <select className="select" value={followType} onChange={(e) => setFollowType(e.target.value as FollowUpType)}>
              {(Object.keys(FOLLOWUP_TYPE_LABELS) as FollowUpType[]).map((t) => (
                <option key={t} value={t}>{FOLLOWUP_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>结果摘要</label>
            <textarea className="input" rows={3} value={followContent} onChange={(e) => setFollowContent(e.target.value)} placeholder="例如：家长有意向，约下周再沟通续费" />
          </div>
          <div className="field">
            <label>下次跟进日期（可选）</label>
            <input className="input" type="date" value={followNextDate} onChange={(e) => setFollowNextDate(e.target.value)} />
          </div>
          <div className="flex" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setShowFollowUp(false)}>取消</button>
            <button className="btn primary" onClick={recordFollowUp} disabled={!followContent.trim()}>保存跟进</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
