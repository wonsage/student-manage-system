// 主题与展示辅助：科目配色、头像配色等。

export const SUBJECT_COLORS: Record<string, string> = {
  数学: "#2563eb",
  英语: "#16a34a",
  科学: "#7c3aed",
  中文: "#dc2626",
  物理: "#d97706",
  化学: "#0891b2",
};

export function subjectColor(subject?: string | null): string {
  if (!subject) return "#64748b";
  return SUBJECT_COLORS[subject] ?? "#64748b";
}

const AVATAR_PALETTE = [
  "#2563eb", "#7c3aed", "#0891b2", "#16a34a",
  "#d97706", "#db2777", "#4f46e5", "#0d9488",
];

export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

/** 取姓名首字（用于头像占位），空则显示「学」。 */
export function initialOf(name?: string | null): string {
  if (!name) return "学";
  return name.trim().slice(0, 1);
}

export const WEEKDAY_NAMES = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
export const WEEKDAY_SHORT = ["", "一", "二", "三", "四", "五", "六", "日"];

/** "YYYY-MM-DD" 加减天数。 */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → "10月13日"。 */
export function fmtMD(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${Number(m)}月${Number(d)}日`;
}

/** "YYYY-MM-DD" → ISO 星期几 1=Mon..7=Sun。 */
export function dowOfDate(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  return ((d.getUTCDay() + 6) % 7) + 1;
}

/** "YYYY-MM-DD" → "周一"。 */
export function weekdayName(dateStr: string): string {
  return WEEKDAY_NAMES[dowOfDate(dateStr)];
}

/** 所在周（周一为起点）。 */
export function startOfWeek(dateStr: string): string {
  return addDays(dateStr, -(dowOfDate(dateStr) - 1));
}

/** 所在月首日。 */
export function startOfMonth(dateStr: string): string {
  const [y, m] = dateStr.split("-");
  return `${y}-${m}-01`;
}

/** "YYYY-MM-DD" → "2026年10月"。 */
export function monthLabel(dateStr: string): string {
  const [y, m] = dateStr.split("-");
  return `${y}年${Number(m)}月`;
}

/** 当月天数。 */
export function daysInMonth(dateStr: string): number {
  const [y, m] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
