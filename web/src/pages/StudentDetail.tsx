import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { Spinner, Modal, useToast, Empty } from "../components/ui";
import type { ClassInfo, CreditTransaction, FollowUp, FollowUpType, Student } from "../types";
import { STATUS_LABELS, FOLLOWUP_TYPE_LABELS, CREDIT_TX_LABELS } from "../types";

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
};

function timeOverlap(aS: string, aE: string, bS: string, bE: string) {
  const toM = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  return toM(aS) < toM(bE) && toM(bS) < toM(aE);
}

const WEEKDAY = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

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

  if (error) return <div className="error-banner">{error}</div>;
  if (!student) return <Spinner />;

  return (
    <div>
      <div className="page-head">
        <div>
          <Link to="/students" className="small muted">← 返回列表</Link>
          <h1 style={{ marginTop: 4 }}>
            {student.name}
            <span className={`badge ${student.status}`} style={{ marginLeft: 10 }}>
              {STATUS_LABELS[student.status]}
            </span>
          </h1>
          <div className="sub">
            剩余课时 <b>{student.remainingCredits}</b> · 负责人 {student.admin.name}
          </div>
        </div>
        <div className="flex">
          <button className="btn primary" onClick={() => setShowEnroll(true)}>
            报名 / 续费
          </button>
          <button
            className="btn primary"
            onClick={() => setShowSchedule(true)}
            disabled={student.status !== "ENROLLED"}
          >
            排进班级
          </button>
          <button className="btn" onClick={() => setShowFollowUp(true)}>
            记录跟进
          </button>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>基本信息</h3>
          <dl className="kv">
            <dt>学生姓名</dt>
            <dd>{student.name}</dd>
            <dt>年级 / 水平</dt>
            <dd>{student.level || "—"}</dd>
            <dt>家长</dt>
            <dd>{student.guardianName || "—"}</dd>
            <dt>家长电话</dt>
            <dd>{student.guardianPhone || "—"}</dd>
            <dt>备注</dt>
            <dd>{student.note || "—"}</dd>
          </dl>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>课时账户</h3>
          {student.enrollments.length === 0 ? (
            <div className="muted small">暂无报名记录</div>
          ) : (
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
                    <td className="small">
                      {new Date(e.purchasedAt).toLocaleDateString("zh-CN")}
                    </td>
                    <td>{e.creditsTotal}</td>
                    <td>{e.creditsRemaining}</td>
                    <td>
                      <span className={`badge ${e.status}`}>{e.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>课时流水</h3>
          {student.creditTransactions.length === 0 ? (
            <div className="muted small">暂无课时流水</div>
          ) : (
            student.creditTransactions.map((tx) => (
              <div key={tx.id} className="ledger-row flex between">
                <div>
                  <div className="small">
                    <b>{CREDIT_TX_LABELS[tx.type]}</b>
                    {tx.lesson && (
                      <span className="muted"> · {tx.lesson.class.name}</span>
                    )}
                  </div>
                  <div className="small muted">
                    {new Date(tx.createdAt).toLocaleDateString("zh-CN")} · 结余 {tx.balanceAfter}
                    {tx.note ? ` · ${tx.note}` : ""}
                  </div>
                </div>
                <span className={`ledger-amount ${tx.amount >= 0 ? "pos" : "neg"}`}>
                  {tx.amount >= 0 ? `+${tx.amount}` : tx.amount}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>跟进记录</h3>
          {student.followUps.length === 0 ? (
            <div className="muted small">暂无跟进记录，点击右上角「记录跟进」</div>
          ) : (
            student.followUps.map((f) => (
              <div key={f.id} className="ledger-row">
                <div className="flex between">
                  <span className="small">
                    <b>{FOLLOWUP_TYPE_LABELS[f.type]}</b>
                  </span>
                  <span className="small muted">
                    {new Date(f.createdAt).toLocaleDateString("zh-CN")}
                  </span>
                </div>
                <div className="small">{f.content}</div>
                {f.nextFollowUpAt && (
                  <div className="small muted">
                    下次跟进：{new Date(f.nextFollowUpAt).toLocaleDateString("zh-CN")}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>所在班级</h3>
          {student.memberships.length === 0 ? (
            <div className="muted small">尚未排进任何班级</div>
          ) : (
            student.memberships.map((m) => (
              <div key={m.class.id} className="flex between" style={{ padding: "6px 0" }}>
                <div>
                  <b>{m.class.name}</b>
                  <div className="muted small">
                    {WEEKDAY[m.class.dayOfWeek]} {m.class.startTime}-{m.class.endTime} · {m.class.teacher.name}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>最近课堂反馈</h3>
          {student.feedbacks.length === 0 ? (
            <div className="muted small">暂无反馈</div>
          ) : (
            student.feedbacks.map((f) => (
              <div key={f.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
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
            <button className="btn" onClick={() => setShowEnroll(false)}>
              取消
            </button>
            <button className="btn primary" onClick={enroll}>
              确认购买
            </button>
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
                <div
                  key={c.id}
                  className="flex between"
                  style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}
                >
                  <div>
                    <b>{c.name}</b>
                    <div className="muted small">
                      {WEEKDAY[c.dayOfWeek]} {c.startTime}-{c.endTime} · {c.teacher.name} · {c.memberCount}/{c.capacity} 人
                    </div>
                    {conflict && (
                      <div className="small" style={{ color: "var(--danger)" }}>
                        ⚠ 与学生已有班级时间冲突
                      </div>
                    )}
                    {alreadyIn && <div className="small muted">✓ 已在班内</div>}
                    {full && <div className="small" style={{ color: "var(--warn)" }}>已满</div>}
                  </div>
                  <button
                    className="btn small primary"
                    disabled={!canSchedule}
                    onClick={() => schedule(c.id, c.name)}
                  >
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
            <select
              className="select"
              value={followType}
              onChange={(e) => setFollowType(e.target.value as FollowUpType)}
            >
              {(Object.keys(FOLLOWUP_TYPE_LABELS) as FollowUpType[]).map((t) => (
                <option key={t} value={t}>
                  {FOLLOWUP_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>结果摘要</label>
            <textarea
              className="input"
              rows={3}
              value={followContent}
              onChange={(e) => setFollowContent(e.target.value)}
              placeholder="例如：家长有意向，约下周再沟通续费"
            />
          </div>
          <div className="field">
            <label>下次跟进日期（可选）</label>
            <input
              className="input"
              type="date"
              value={followNextDate}
              onChange={(e) => setFollowNextDate(e.target.value)}
            />
          </div>
          <div className="flex" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setShowFollowUp(false)}>
              取消
            </button>
            <button className="btn primary" onClick={recordFollowUp} disabled={!followContent.trim()}>
              保存跟进
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
