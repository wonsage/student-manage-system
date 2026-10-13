import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Spinner, Empty } from "./ui";
import type { LessonSummary } from "../types";
import {
  addDays,
  fmtMD,
  monthLabel,
  startOfMonth,
  startOfWeek,
  subjectColor,
  SUBJECT_COLORS,
  weekdayName,
  WEEKDAY_NAMES,
} from "../theme";

type View = "day" | "week" | "month";

const HOUR_START = 8;
const HOUR_END = 21;
const ROW = 52;
const TOP_PAD = 10;
const TOTAL = (HOUR_END - HOUR_START) * ROW + TOP_PAD;

const pad = (n: number) => String(n).padStart(2, "0");

function timeToMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** 周/月视图里的课程块。 */
function WeekEvent({ l, onClick }: { l: LessonSummary; onClick?: () => void }) {
  const top = TOP_PAD + ((timeToMin(l.class.startTime) - HOUR_START * 60) / 60) * ROW;
  const height = Math.max(((timeToMin(l.class.endTime) - timeToMin(l.class.startTime)) / 60) * ROW, 26);
  const color = subjectColor(l.class.subject);
  return (
    <div
      className="cal-event"
      style={{ top, height, background: color }}
      onClick={onClick}
      title={`${l.class.name} · ${l.class.startTime}-${l.class.endTime} · ${l.class.teacher.name} · ${l.class.memberCount} 人`}
    >
      <div className="ev-t">{l.class.name}</div>
      <div className="ev-s">{l.class.startTime} · {l.class.teacher.name}</div>
    </div>
  );
}

export function Calendar({ onEventClick }: { onEventClick?: (l: LessonSummary) => void }) {
  const [today, setToday] = useState("");
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState("");
  const [lessons, setLessons] = useState<LessonSummary[] | null>(null);
  const [error, setError] = useState("");

  // 初始化：拿到业务「今天」，作为光标锚点
  useEffect(() => {
    api
      .meta()
      .then((m) => {
        setToday(m.today);
        setCursor(m.today);
      })
      .catch((e) => setError(e.message));
  }, []);

  // 根据视图与光标计算需要拉取的范围
  const range = useMemo(() => {
    if (!cursor) return null;
    if (view === "day") return { from: cursor, to: cursor };
    if (view === "week") {
      const s = startOfWeek(cursor);
      return { from: s, to: addDays(s, 6) };
    }
    const gridStart = startOfWeek(startOfMonth(cursor));
    return { from: gridStart, to: addDays(gridStart, 41) };
  }, [view, cursor]);

  useEffect(() => {
    if (!range) return;
    setLessons(null);
    api
      .lessonsRange(range.from, range.to)
      .then((r) => setLessons(r.lessons))
      .catch((e) => setError(e.message));
  }, [range]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!today || !cursor) return <Spinner />;

  const eventsByDate = (lessons ?? []).reduce<Record<string, LessonSummary[]>>((acc, l) => {
    (acc[l.date] ??= []).push(l);
    acc[l.date].sort((a, b) => a.class.startTime.localeCompare(b.class.startTime));
    return acc;
  }, {});

  const nav = (dir: 1 | -1) => {
    if (view === "day") setCursor(addDays(cursor, dir));
    else if (view === "week") setCursor(addDays(cursor, dir * 7));
    else {
      const [y, m] = cursor.split("-").map(Number);
      const d = new Date(Date.UTC(y, m - 1 + dir, 1));
      setCursor(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`);
    }
  };

  const title =
    view === "month"
      ? monthLabel(cursor)
      : view === "week"
      ? `${fmtMD(startOfWeek(cursor))} — ${fmtMD(addDays(startOfWeek(cursor), 6))}`
      : `${fmtMD(cursor)} · ${weekdayName(cursor)}`;

  // 周视图七天
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i));
  // 月视图 42 格
  const monthGridStart = startOfWeek(startOfMonth(cursor));
  const monthCells = Array.from({ length: 42 }, (_, i) => addDays(monthGridStart, i));

  return (
    <div className="cal">
      <div className="cal-toolbar">
        <div className="cal-nav">
          <button onClick={() => nav(-1)} aria-label="上一页">‹</button>
          <button className="cal-today-btn" onClick={() => setCursor(today)}>今天</button>
          <button onClick={() => nav(1)} aria-label="下一页">›</button>
          <span className="cal-title">{title}</span>
        </div>
        <div className="cal-legend">
          {Object.keys(SUBJECT_COLORS).map((s) => (
            <span key={s} className="lg">
              <span className="sw" style={{ background: subjectColor(s) }} />
              {s}
            </span>
          ))}
        </div>
        <div className="seg">
          {(["day", "week", "month"] as View[]).map((v) => (
            <button key={v} className={view === v ? "active" : ""} onClick={() => setView(v)}>
              {{ day: "日", week: "周", month: "月" }[v]}
            </button>
          ))}
        </div>
      </div>

      {!lessons ? (
        <Spinner />
      ) : view === "month" ? (
        <div className="cal-month">
          {WEEKDAY_NAMES.slice(1).map((w) => (
            <div key={w} className="m-head">{w}</div>
          ))}
          {monthCells.map((d) => {
            const dayEvents = eventsByDate[d] ?? [];
            const inMonth = d.slice(0, 7) === cursor.slice(0, 7);
            return (
              <div key={d} className={`m-cell ${d === today ? "today" : ""} ${inMonth ? "" : "out"}`}>
                <span className={`m-dnum ${d === today ? "today" : ""}`}>{Number(d.slice(8, 10))}</span>
                <div className="m-events">
                  {dayEvents.slice(0, 3).map((l) => (
                    <div
                      key={l.id}
                      className="m-chip"
                      style={{ background: subjectColor(l.class.subject) }}
                      onClick={() => onEventClick?.(l)}
                      title={`${l.class.name} ${l.class.startTime}-${l.class.endTime}`}
                    >
                      {l.class.startTime} {l.class.name}
                    </div>
                  ))}
                  {dayEvents.length > 3 && <div className="m-more">+{dayEvents.length - 3} 更多</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : view === "week" ? (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "48px repeat(7, 1fr)", borderBottom: "1px solid var(--line)" }}>
            <div />
            {weekDays.map((d) => (
              <div key={d} style={{ padding: "10px 6px", textAlign: "center" }}>
                <div className="dow" style={{ fontSize: 12, color: "var(--muted)" }}>{weekdayName(d)}</div>
                <span className={`dnum ${d === today ? "today" : ""}`} style={{ display: "inline-block", width: 28, height: 28, lineHeight: "28px", borderRadius: "50%", fontWeight: 700, background: d === today ? "var(--accent)" : "transparent", color: d === today ? "#fff" : "inherit" }}>
                  {Number(d.slice(8, 10))}
                </span>
              </div>
            ))}
          </div>
          <div style={{ position: "relative", height: TOTAL, overflowY: "auto" }}>
            {/* 小时网格线 */}
            {Array.from({ length: HOUR_END - HOUR_START + 1 }).map((_, i) => (
              <div key={i} style={{ position: "absolute", top: TOP_PAD + i * ROW, left: 0, right: 0, borderTop: "1px solid var(--line)", height: 0, zIndex: 0 }} />
            ))}
            {/* 左侧时间轴 */}
            <div style={{ position: "absolute", left: 0, top: 0, width: 48, height: TOTAL }}>
              {Array.from({ length: HOUR_END - HOUR_START }).map((_, i) => (
                <div key={i} style={{ position: "absolute", top: TOP_PAD + i * ROW - 7, width: 48, textAlign: "right", paddingRight: 6, fontSize: 11, color: "var(--faint)" }}>
                  {pad(HOUR_START + i)}:00
                </div>
              ))}
            </div>
            {/* 7 天列 */}
            <div style={{ position: "absolute", left: 48, right: 0, top: 0, height: TOTAL, display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
              {weekDays.map((d, di) => (
                <div key={d} className={d === today ? "col today" : "col"} style={{ position: "relative", borderLeft: di ? "1px solid var(--line)" : "none", background: d === today ? "rgba(37,99,235,0.03)" : "transparent" }}>
                  {(eventsByDate[d] ?? []).map((l) => (
                    <WeekEvent key={l.id} l={l} onClick={() => onEventClick?.(l)} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="cal-day">
          {(eventsByDate[cursor] ?? []).length === 0 ? (
            <Empty text="这一天没有课程" />
          ) : (
            (eventsByDate[cursor] ?? []).map((l) => (
              <div key={l.id} className="day-event" onClick={() => onEventClick?.(l)}>
                <span className="ev-time">{l.class.startTime} - {l.class.endTime}</span>
                <span className="ev-color" style={{ background: subjectColor(l.class.subject) }} />
                <div style={{ flex: 1 }}>
                  <b>{l.class.name}</b>
                  <div className="small muted">
                    {l.class.subject ?? ""} · {l.class.teacher.name} · {l.class.memberCount} 人
                    {l.attendanceCount > 0 && ` · 已点名 ${l.attendanceCount}`}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
