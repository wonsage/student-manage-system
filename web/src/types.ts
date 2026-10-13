export type Role = "ADMIN" | "TEACHER";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export type StudentStatus =
  | "LEAD"
  | "TRIAL_SCHEDULED"
  | "TRIAL_DONE"
  | "ENROLLED"
  | "CHURNED";

export interface Student {
  id: string;
  name: string;
  nickname?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  phone?: string | null;
  level?: string | null;
  status: StudentStatus;
  note?: string | null;
  remainingCredits: number;
  admin: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface Enrollment {
  id: string;
  creditsTotal: number;
  creditsRemaining: number;
  note?: string | null;
  status: "ACTIVE" | "EXHAUSTED" | "REFUNDED";
  purchasedAt: string;
}

export interface ClassInfo {
  id: string;
  name: string;
  subject?: string | null;
  level?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  capacity: number;
  memberCount: number;
  teacher: { id: string; name: string };
}

export interface LessonSummary {
  id: string;
  date: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  class: {
    id: string;
    name: string;
    subject?: string | null;
    level?: string | null;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    teacher: { id: string; name: string };
    memberCount: number;
  };
  attendanceCount: number;
}

export interface RosterStudent {
  id: string;
  name: string;
  level?: string | null;
  isNew: boolean;
  remainingCredits: number;
}

export interface RosterEntry {
  student: RosterStudent;
  attendance: {
    status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
    creditsDeducted: number;
  } | null;
  feedback: {
    summary: string;
    strengths?: string | null;
    nextSteps?: string | null;
    generatedBy: "LLM" | "MANUAL";
  } | null;
}

export interface LessonDetail {
  id: string;
  date: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  class: {
    id: string;
    name: string;
    subject?: string | null;
    level?: string | null;
    startTime: string;
    endTime: string;
    teacher: { id: string; name: string };
  };
  roster: RosterEntry[];
}

export const STATUS_LABELS: Record<StudentStatus, string> = {
  LEAD: "咨询意向",
  TRIAL_SCHEDULED: "已约试听",
  TRIAL_DONE: "试听待跟进",
  ENROLLED: "已报名",
  CHURNED: "已流失",
};

export const ATTENDANCE_LABELS: Record<string, string> = {
  PRESENT: "出勤",
  ABSENT: "缺勤",
  LATE: "迟到",
  EXCUSED: "请假",
};

export type FollowUpType = "CALL" | "WECHAT" | "MEETING" | "TRIAL" | "OTHER";

export const FOLLOWUP_TYPE_LABELS: Record<FollowUpType, string> = {
  CALL: "电话",
  WECHAT: "微信",
  MEETING: "面谈",
  TRIAL: "试听",
  OTHER: "其他",
};

export interface FollowUp {
  id: string;
  studentId: string;
  type: FollowUpType;
  content: string;
  nextFollowUpAt?: string | null;
  completed: boolean;
  createdAt: string;
}

export type CreditTxType = "PURCHASE" | "DEDUCT" | "REFUND";

export const CREDIT_TX_LABELS: Record<CreditTxType, string> = {
  PURCHASE: "购买",
  DEDUCT: "扣课时",
  REFUND: "退费",
};

export interface CreditTransaction {
  id: string;
  studentId: string;
  enrollmentId?: string | null;
  lessonId?: string | null;
  type: CreditTxType;
  amount: number;
  balanceAfter: number;
  note?: string | null;
  createdAt: string;
  lesson?: { class: { name: string } } | null;
}

export interface AttendanceRecord {
  id: string;
  status: string;
  creditsDeducted: number;
  recordedAt: string;
  lesson: { date: string; class: { name: string } };
}

export interface DashboardStats {
  myStudents: number;
  enrolled: number;
  pendingTrial: number;
  lowCredits: number;
  newThisWeek: number;
  totalCredits: number;
  attendanceRate: number;
}

export interface TrendPoint {
  date: string;
  count: number;
}

export interface StatusSlice {
  status: string;
  count: number;
}

export interface DashboardData {
  today: string;
  stats: DashboardStats;
  enrollmentTrend: TrendPoint[];
  creditConsumption: TrendPoint[];
  statusDistribution: StatusSlice[];
}

export interface TeacherOverview {
  today: string;
  todayCount: number;
  weekCount: number;
  myStudents: number;
  pendingAttendance: number;
}
