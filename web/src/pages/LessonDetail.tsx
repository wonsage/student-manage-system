import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { Spinner, Empty, Modal, useToast, Avatar } from "../components/ui";
import type { LessonDetail, RosterEntry } from "../types";
import { ATTENDANCE_LABELS } from "../types";
import { subjectColor, fmtMD } from "../theme";

const ATT = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;

interface FeedbackForm {
  summary: string;
  strengths: string;
  nextSteps: string;
  generatedBy: "LLM" | "MANUAL";
}

export function LessonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState<string | null>(null);
  const [editStudent, setEditStudent] = useState<RosterEntry | null>(null);
  const [form, setForm] = useState<FeedbackForm>({
    summary: "",
    strengths: "",
    nextSteps: "",
    generatedBy: "MANUAL",
  });

  const load = useCallback(() => {
    if (!id) return;
    setLesson(null);
    api
      .lesson(id)
      .then((res) => setLesson(res.lesson))
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(load, [load]);

  const markAttendance = async (studentId: string, status: string) => {
    try {
      await api.markAttendance(id!, studentId, status);
      load();
    } catch (e: any) {
      toast("err", e.message);
    }
  };

  const markAll = async () => {
    try {
      const res = await api.markAllPresent(id!);
      if (res.skipped.length) {
        toast("err", `已记 ${res.marked.length} 人；${res.skipped.length} 人课时不足被跳过`);
      } else {
        toast("ok", `已记 ${res.marked.length} 人出勤`);
      }
      load();
    } catch (e: any) {
      toast("err", e.message);
    }
  };

  const generate = async (entry: RosterEntry) => {
    setGenerating(entry.student.id);
    try {
      const res = await api.generateFeedback(id!, entry.student.id);
      if (res.ok) {
        setForm({
          summary: res.feedback.summary,
          strengths: res.feedback.strengths ?? "",
          nextSteps: res.feedback.nextSteps ?? "",
          generatedBy: "LLM",
        });
        toast("ok", "已生成反馈草稿，可编辑后保存");
      } else {
        toast("err", `AI 生成失败（${res.reason}），已切换为手写`);
        setForm({ summary: "", strengths: "", nextSteps: "", generatedBy: "MANUAL" });
      }
      setEditStudent(entry);
    } catch (e: any) {
      toast("err", e.message);
    } finally {
      setGenerating(null);
    }
  };

  const openManual = (entry: RosterEntry) => {
    setForm({
      summary: entry.feedback?.summary ?? "",
      strengths: entry.feedback?.strengths ?? "",
      nextSteps: entry.feedback?.nextSteps ?? "",
      generatedBy: entry.feedback?.generatedBy ?? "MANUAL",
    });
    setEditStudent(entry);
  };

  const saveFeedback = async () => {
    if (!editStudent || !form.summary.trim()) return;
    try {
      await api.saveFeedback(id!, {
        studentId: editStudent.student.id,
        summary: form.summary.trim(),
        strengths: form.strengths.trim() || undefined,
        nextSteps: form.nextSteps.trim() || undefined,
        generatedBy: form.generatedBy,
      });
      toast("ok", "反馈已保存");
      setEditStudent(null);
      load();
    } catch (e: any) {
      toast("err", e.message);
    }
  };

  if (error) return <div className="error-banner">{error}</div>;
  if (!lesson) return <Spinner />;

  const presentCount = lesson.roster.filter(
    (r) => r.attendance?.status === "PRESENT"
  ).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <Link to="/" className="back-link">← 返回课程</Link>
          <h1 style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 10 }}>
            <span className="ev-color" style={{ width: 6, height: 26, borderRadius: 3, background: subjectColor(lesson.class.subject) }} />
            {lesson.class.name}
          </h1>
          <div className="sub">
            {fmtMD(lesson.date)} · {lesson.class.startTime}-{lesson.class.endTime} ·{" "}
            {lesson.class.teacher.name} · {lesson.class.subject ?? ""}
          </div>
        </div>
        <button className="btn primary" onClick={markAll}>
          全员出勤
        </button>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="flex between">
          <span className="small muted">出勤进度</span>
          <span className="small strong">{presentCount}/{lesson.roster.length} 人</span>
        </div>
        <div className="progress mt-8" style={{ height: 10 }}>
          <span style={{ width: `${lesson.roster.length ? (presentCount / lesson.roster.length) * 100 : 0}%`, background: "var(--success)" }} />
        </div>
      </div>

      <div className="card">
        {lesson.roster.length === 0 ? (
          <Empty text="该班还没有学生" />
        ) : (
          lesson.roster.map((entry) => {
            const st = entry.student;
            const att = entry.attendance?.status;
            return (
              <div key={st.id} className="roster-row" style={{ flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar name={st.name} size="sm" />
                    <span className="name">{st.name}</span>
                    {st.isNew && <span className="badge new-tag">⭐ 新学生</span>}
                  </div>
                  <div className="meta" style={{ paddingLeft: 38 }}>
                    {st.level || "—"} · 剩余 {st.remainingCredits} 课时
                  </div>
                </div>

                <div className="att-group">
                  {ATT.map((a) => (
                    <button
                      key={a}
                      className={`att-btn ${att === a ? `on-${a}` : ""}`}
                      onClick={() => markAttendance(st.id, a)}
                    >
                      {ATTENDANCE_LABELS[a]}
                    </button>
                  ))}
                </div>

                <div style={{ minWidth: 200, flex: 1 }}>
                  {entry.feedback ? (
                    <div className="feedback-box">
                      <div className="tag-row">
                        <span className="small muted">课堂反馈</span>
                        {entry.feedback.generatedBy === "LLM" && (
                          <span className="badge llm">AI 生成</span>
                        )}
                      </div>
                      <div className="small">{entry.feedback.summary}</div>
                      <button className="btn small mt-16" onClick={() => openManual(entry)}>
                        编辑
                      </button>
                    </div>
                  ) : (
                    <div className="flex">
                      <button
                        className="btn small"
                        disabled={generating === st.id}
                        onClick={() => generate(entry)}
                      >
                        {generating === st.id ? "生成中…" : "✨ AI 生成反馈"}
                      </button>
                      <button className="btn small" onClick={() => openManual(entry)}>
                        手写
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {editStudent && (
        <Modal
          title={`课堂反馈 — ${editStudent.student.name}`}
          onClose={() => setEditStudent(null)}
        >
          {form.generatedBy === "LLM" && (
            <div className="small muted mb-16">🤖 这是 AI 生成的草稿，请确认或修改后保存。</div>
          )}
          <div className="field">
            <label>总结</label>
            <textarea
              className="input"
              rows={3}
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              placeholder="本节课的表现总结…"
            />
          </div>
          <div className="field">
            <label>表现好的地方</label>
            <textarea
              className="input"
              rows={2}
              value={form.strengths}
              onChange={(e) => setForm({ ...form, strengths: e.target.value })}
            />
          </div>
          <div className="field">
            <label>建议下一步</label>
            <textarea
              className="input"
              rows={2}
              value={form.nextSteps}
              onChange={(e) => setForm({ ...form, nextSteps: e.target.value })}
            />
          </div>
          <div className="flex" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setEditStudent(null)}>
              取消
            </button>
            <button className="btn primary" onClick={saveFeedback} disabled={!form.summary.trim()}>
              保存反馈
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
