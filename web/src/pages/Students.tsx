import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Spinner, Empty, Modal, useToast } from "../components/ui";
import type { Student, StudentStatus } from "../types";
import { STATUS_LABELS } from "../types";

const STATUS_OPTIONS: { value: "" | StudentStatus; label: string }[] = [
  { value: "", label: "全部状态" },
  { value: "LEAD", label: "咨询意向" },
  { value: "TRIAL_SCHEDULED", label: "已约试听" },
  { value: "TRIAL_DONE", label: "试听待跟进" },
  { value: "ENROLLED", label: "已报名" },
  { value: "CHURNED", label: "已流失" },
];

export function Students() {
  const [params, setParams] = useSearchParams();
  const scope = params.get("scope") ?? "mine";
  const status = params.get("status") ?? "";
  const q = params.get("q") ?? "";
  const filter = params.get("filter") ?? "";

  const [students, setStudents] = useState<Student[] | null>(null);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const toast = useToast();

  // filter=lowCredits/pendingTrial 来自工作台快捷入口
  const effectiveStatus =
    filter === "pendingTrial" ? "TRIAL_DONE" : status;

  const load = () => {
    setStudents(null);
    api
      .students({ scope, status: effectiveStatus, q })
      .then((res) => setStudents(res.students))
      .catch((e) => setError(e.message));
  };

  useEffect(load, [scope, effectiveStatus, q]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  const create = async () => {
    if (!name.trim()) return;
    try {
      await api.createStudent({ name: name.trim() });
      toast("ok", `已新增学生「${name.trim()}」`);
      setName("");
      setShowNew(false);
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
          <h1>学生管理</h1>
          <div className="sub">
            {scope === "all" ? "全部学生（只读协作视图）" : "我的学生"}
          </div>
        </div>
        <button className="btn primary" onClick={() => setShowNew(true)}>
          ＋ 新增学生
        </button>
      </div>

      <div className="card">
        <div className="flex mb-16" style={{ flexWrap: "wrap" }}>
          <div className="flex">
            <button
              className={`btn small ${scope === "mine" ? "primary" : ""}`}
              onClick={() => setParam("scope", "mine")}
            >
              只看我的
            </button>
            <button
              className={`btn small ${scope === "all" ? "primary" : ""}`}
              onClick={() => setParam("scope", "all")}
            >
              全部学生
            </button>
          </div>
          <select
            className="select"
            style={{ width: 160 }}
            value={status}
            onChange={(e) => setParam("status", e.target.value)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            className="input"
            style={{ width: 200 }}
            placeholder="搜索姓名…"
            value={q}
            onChange={(e) => setParam("q", e.target.value)}
          />
        </div>

        {!students ? (
          <Spinner />
        ) : students.length === 0 ? (
          <Empty text="没有符合条件的学生" />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>姓名</th>
                <th>状态</th>
                <th>剩余课时</th>
                <th>负责人</th>
                <th>最近更新</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
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
                      <span
                        style={{
                          color: s.remainingCredits <= 2 ? "var(--warn)" : "var(--ink)",
                          fontWeight: s.remainingCredits <= 2 ? 700 : 400,
                        }}
                      >
                        {s.remainingCredits}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="muted">{s.admin.name}</td>
                  <td className="muted small">
                    {new Date(s.updatedAt).toLocaleDateString("zh-CN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && (
        <Modal title="新增学生" onClose={() => setShowNew(false)}>
          <div className="field">
            <label>学生姓名</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：张小明"
              autoFocus
            />
          </div>
          <div className="flex" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setShowNew(false)}>
              取消
            </button>
            <button className="btn primary" onClick={create} disabled={!name.trim()}>
              创建
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
