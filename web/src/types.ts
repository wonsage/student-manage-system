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
