import { useEffect, useState } from "react";
import { api } from "../api";
import { Spinner, Empty, Modal, useToast } from "../components/ui";
import { Calendar } from "../components/Calendar";
import type { ClassInfo } from "../types";
import { subjectColor, WEEKDAY_NAMES } from "../theme";

type Mode = "calendar" | "list";

export function Classes() {
  const [classes, setClasses] = useState<ClassInfo[] | null>(null);
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [mode, setMode] = useState<Mode>("calendar");
  const toast = useToast();

  const [form, setForm] = useState({
    name: "",
    subject: "",
    teacherId: "",
    dayOfWeek: 1,
    startTime: "15:30",
    endTime: "17:00",
    capacity: 10,
  });

  const load = () => {
    Promise.all([api.classes(), api.teachers()])
      .then(([c, t]) => {
        setClasses(c.classes);
        setTeachers(t.teachers);
        if (t.teachers.length && !form.teacherId) {
          setForm((f) => ({ ...f, teacherId: t.teachers[0].id }));
        }
      })
      .catch((e) => setError(e.message));
  };

  useEffect(load, []);

  const create = async () => {
    if (!form.name.trim() || !form.teacherId) return;
    try {
      await api.createClass(form);
      toast("ok", `已创建班级「${form.name}」`);
      setShowNew(false);
      setForm((f) => ({ ...f, name: "", subject: "" }));
      load();
    } catch (e: any) {
      toast("err", e.message);
    }
  };

  if (error) return <div className="error-banner">{error}</div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>班级与排课</h1>
          <div className="sub">班级是每周固定的模板，具体某一天的「课」由系统自动生成。</div>
        </div>
        <div className="flex">
          <div className="seg">
            <button className={mode === "calendar" ? "active" : ""} onClick={() => setMode("calendar")}>
              📅 日历视图
            </button>
            <button className={mode === "list" ? "active" : ""} onClick={() => setMode("list")}>
              📋 列表视图
            </button>
          </div>
          <button className="btn primary" onClick={() => setShowNew(true)}>
            ＋ 新建班级
          </button>
        </div>
      </div>

      {mode === "calendar" ? (
        <Calendar />
      ) : (
        <div className="card">
          {!classes ? (
            <Spinner />
          ) : classes.length === 0 ? (
            <Empty text="还没有班级，点击右上角新建" />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>班级</th>
                    <th>科目</th>
                    <th>上课时间</th>
                    <th>老师</th>
                    <th>人数</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="cell-name">
                          <span className="ev-color" style={{ width: 5, alignSelf: "stretch", borderRadius: 3, background: subjectColor(c.subject) }} />
                          <span className="nm">{c.name}</span>
                        </div>
                      </td>
                      <td>{c.subject || "—"}</td>
                      <td>
                        {WEEKDAY_NAMES[c.dayOfWeek]} {c.startTime}-{c.endTime}
                      </td>
                      <td>{c.teacher.name}</td>
                      <td>
                        <span style={{ color: c.memberCount >= c.capacity ? "var(--danger)" : "var(--ink)" }}>
                          {c.memberCount}/{c.capacity}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showNew && (
        <Modal title="新建班级" onClose={() => setShowNew(false)}>
          <div className="field">
            <label>班级名称</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例如：数学 A 班"
              autoFocus
            />
          </div>
          <div className="field">
            <label>科目</label>
            <input
              className="input"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="例如：数学"
            />
          </div>
          <div className="field">
            <label>老师</label>
            <select
              className="select"
              value={form.teacherId}
              onChange={(e) => setForm({ ...form, teacherId: e.target.value })}
            >
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex">
            <div className="field" style={{ flex: 1 }}>
              <label>星期</label>
              <select
                className="select"
                value={form.dayOfWeek}
                onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })}
              >
                {WEEKDAY_NAMES.slice(1).map((w, i) => (
                  <option key={i} value={i + 1}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>开始时间</label>
              <input
                className="input"
                type="time"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>结束时间</label>
              <input
                className="input"
                type="time"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label>班级容量</label>
            <input
              className="input"
              type="number"
              min={1}
              max={50}
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
            />
          </div>
          <div className="flex" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setShowNew(false)}>
              取消
            </button>
            <button className="btn primary" onClick={create} disabled={!form.name.trim() || !form.teacherId}>
              创建
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
