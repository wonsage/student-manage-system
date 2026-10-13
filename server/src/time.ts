// 业务时间统一使用 Australia/Melbourne 时区（作业要求，单时区，无多时区切换）。
export const MELBOURNE_TZ = "Australia/Melbourne";

/** 今天的 Melbourne 本地日期，格式 "YYYY-MM-DD"。 */
export function melbourneToday(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MELBOURNE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** 今天在 Melbourne 是星期几，1=周一 .. 7=周日（ISO-8601）。 */
export function melbourneDayOfWeek(): number {
  const dow = new Intl.DateTimeFormat("en-US", {
    timeZone: MELBOURNE_TZ,
    weekday: "short",
  }).format(new Date());
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return map[dow];
}

/** Melbourne 本地日期（offsetDays 天后），格式 "YYYY-MM-DD"。 */
export function melbourneDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MELBOURNE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * 从今天起 horizonDays 天内，命中指定星期几（1=Mon .. 7=Sun）的 Melbourne 本地日期列表。
 * 用于把班级「模板」物化为具体「课」实例（Lesson）。
 */
export function upcomingDatesForDayOfWeek(
  dayOfWeek: number,
  horizonDays: number
): string[] {
  const dates: string[] = [];
  for (let offset = 0; offset <= horizonDays; offset++) {
    const date = melbourneDate(offset);
    const d = new Date(date + "T00:00:00Z");
    const dow = ((d.getUTCDay() + 6) % 7) + 1; // 转 ISO-8601 1=Mon..7=Sun
    if (dow === dayOfWeek) dates.push(date);
  }
  return dates;
}

/** "HH:MM" → 当天已过分钟数。 */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return -1;
  return h * 60 + m;
}

export const WEEKDAY_NAMES = [
  "",
  "周一",
  "周二",
  "周三",
  "周四",
  "周五",
  "周六",
  "周日",
];
