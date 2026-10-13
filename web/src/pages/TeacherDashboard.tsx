import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Spinner, Empty } from "../components/ui";
import type { LessonSummary } from "../types";

const WEEKDAY = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export function TeacherDashboard() {
  const { user } = useAuth();
  const [lessons, setLessons] = useState<LessonSummary[] | null>(null);
  const [date, setDate] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setLessons(null);
    api
      .lessons(date || undefined)
      .then((res) => {
        setLessons(res.lessons);
        if (!date) setDate(res.date);
      })
      .catch((e) => setError(e.message));
  }, [date]);

  if (error) return <div className="error-banner">{error}</div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>你好，{user?.name}</h1>
          <div className="sub">下面是你今天的课程，点进去即可点名记出勤、写反馈。</div>
        </div>
        <input
          className="input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ width: 160 }}
        />
      </div>

      {!lessons ? (
        <Spinner />
      ) : lessons.length === 0 ? (
        <Empty text="今天没有课程安排" />
      ) : (
        <div className="stats-grid" style={{ gridTemplateColumns: "1fr" }}>
          {lessons.map((l) => {
            const ratio = l.class.memberCount
              ? `${l.attendanceCount}/${l.class.memberCount}`
              : "0";
            return (
              <Link key={l.id} to={`/lessons/${l.id}`} className="card" style={{ display: "block" }}>
                <div className="flex between">
                  <div>
                    <b style={{ fontSize: "1.05rem" }}>{l.class.name}</b>
                    <div className="muted small">
                      {l.class.subject || "课程"} · {l.class.level || ""} ·{" "}
                      {WEEKDAY[l.class.dayOfWeek]} {l.class.startTime}-{l.class.endTime}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="small muted">已记出勤</div>
                    <b>{ratio}</b>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
