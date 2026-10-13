import type {
  ClassInfo,
  Enrollment,
  LessonDetail,
  LessonSummary,
  Student,
  User,
} from "./types";

const TOKEN_KEY = "sm_token";
const USER_KEY = "sm_user";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSession(token: string, user: User) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401) {
    clearSession();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? "请求失败");
  }
  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: { email, password },
    }),

  dashboard: () => request<{ stats: { myStudents: number; pendingTrial: number; lowCredits: number; newThisWeek: number } }>("/dashboard"),

  students: (params: { scope?: string; status?: string; q?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.scope) qs.set("scope", params.scope);
    if (params.status) qs.set("status", params.status);
    if (params.q) qs.set("q", params.q);
    const q = qs.toString();
    return request<{ students: Student[] }>(`/students${q ? `?${q}` : ""}`);
  },

  student: (id: string) =>
    request<{
      student: Student & {
        enrollments: Enrollment[];
        memberships: { class: ClassInfo & { teacher: { name: string } } }[];
        feedbacks: { id: string; summary: string; generatedBy: string; lesson: { class: { name: string } } }[];
      };
    }>(`/students/${id}`),

  createStudent: (body: Partial<Student>) =>
    request<{ student: Student }>("/students", { method: "POST", body }),

  enroll: (studentId: string, credits: number, note?: string) =>
    request<{ enrollment: Enrollment }>(`/students/${studentId}/enrollments`, {
      method: "POST",
      body: { credits, note },
    }),

  classes: () => request<{ classes: ClassInfo[] }>("/classes"),

  teachers: () => request<{ teachers: { id: string; name: string }[] }>("/teachers"),

  createClass: (body: unknown) =>
    request<{ class: ClassInfo }>("/classes", { method: "POST", body }),

  addMember: (classId: string, studentId: string) =>
    request(`/classes/${classId}/members`, {
      method: "POST",
      body: { studentId },
    }),

  lessons: (date?: string) =>
    request<{ date: string; lessons: LessonSummary[] }>(
      `/lessons${date ? `?date=${date}` : ""}`
    ),

  lesson: (id: string) => request<{ lesson: LessonDetail }>(`/lessons/${id}`),

  markAttendance: (lessonId: string, studentId: string, status: string) =>
    request<{ attendance: { status: string }; deducted: boolean }>(
      `/lessons/${lessonId}/attendances`,
      { method: "POST", body: { studentId, status } }
    ),

  markAllPresent: (lessonId: string) =>
    request<{ marked: string[]; skipped: string[] }>(
      `/lessons/${lessonId}/attendance/mark-all`,
      { method: "POST" }
    ),

  generateFeedback: (lessonId: string, studentId: string) =>
    request<
      | { ok: true; feedback: { summary: string; strengths?: string; nextSteps?: string } }
      | { ok: false; reason: string }
    >(`/lessons/${lessonId}/feedback/generate`, {
      method: "POST",
      body: { studentId },
    }),

  saveFeedback: (
    lessonId: string,
    body: { studentId: string; summary: string; strengths?: string; nextSteps?: string; generatedBy: "LLM" | "MANUAL" }
  ) => request(`/lessons/${lessonId}/feedback`, { method: "POST", body }),
};
