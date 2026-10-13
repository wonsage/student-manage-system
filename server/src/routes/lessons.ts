import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { HttpError, requireAuth } from "../middleware";
import { melbourneToday, melbourneDayOfWeek } from "../time";
import { deductOneCreditTx } from "../rules";
import { generateFeedbackDraft } from "../llm";

export const lessonsRouter = Router();

lessonsRouter.use(requireAuth);

const DAY_MS = 24 * 60 * 60 * 1000;

/** 保证某班在某个日期存在一条 lesson（模板 → 实例的物化），原子幂等。 */
export async function ensureLesson(classId: string, date: string) {
  return prisma.lesson.upsert({
    where: { classId_date: { classId, date } },
    update: {},
    create: { classId, date },
  });
}

/**
 * 在给定事务内为单个学生记录出勤。
 * - 已有记录：只更新状态；此前未扣课时、现在改记 PRESENT 时补扣一次（防"先缺勤再改出勤"白上课）。
 * - 无记录：扣课时（若 PRESENT）与写出勤在同一事务，任一步失败整体回滚。
 * 返回 { attendance, deducted }。
 */
async function recordAttendance(
  tx: Prisma.TransactionClient,
  params: {
    lessonId: string;
    studentId: string;
    status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
    recordedById: string;
  }
) {
  const { lessonId, studentId, status, recordedById } = params;
  const existing = await tx.attendance.findUnique({
    where: { lessonId_studentId: { lessonId, studentId } },
  });

  if (existing) {
    let creditsDeducted = existing.creditsDeducted;
    let deducted = false;
    // 此前未扣课时（如 ABSENT/LATE/EXCUSED），现在改记 PRESENT → 补扣一次
    if (status === "PRESENT" && existing.creditsDeducted === 0) {
      const enrollment = await deductOneCreditTx(tx, studentId, { lessonId });
      if (!enrollment) {
        throw new HttpError(409, "课时不足：该学生剩余课时为 0，无法记出勤");
      }
      creditsDeducted = 1;
      deducted = true;
    }
    const updated = await tx.attendance.update({
      where: { id: existing.id },
      data: { status, creditsDeducted },
    });
    return { attendance: updated, deducted, created: false };
  }

  let creditsDeducted = 0;
  if (status === "PRESENT") {
    const enrollment = await deductOneCreditTx(tx, studentId, { lessonId });
    if (!enrollment) {
      throw new HttpError(409, "课时不足：该学生剩余课时为 0，无法记出勤");
    }
    creditsDeducted = 1;
  }

  const attendance = await tx.attendance.create({
    data: { lessonId, studentId, status, creditsDeducted, recordedById },
  });
  return { attendance, deducted: creditsDeducted > 0, created: true };
}

/** 把 lesson 行规整成 LessonSummary 形状。 */
function toSummary(l: any) {
  return {
    id: l.id,
    date: l.date,
    status: l.status,
    class: {
      id: l.class.id,
      name: l.class.name,
      subject: l.class.subject,
      level: l.class.level,
      dayOfWeek: l.class.dayOfWeek,
      startTime: l.class.startTime,
      endTime: l.class.endTime,
      teacher: l.class.teacher,
      memberCount: l.class._count.members,
    },
    attendanceCount: l._count.attendances,
  };
}

// 列表：teacher 只看自己的课；admin 全看。
//   ?date=YYYY-MM-DD        单日（默认今天）
//   ?from=..&to=..          日期范围（日历日/周/月视图用）
lessonsRouter.get("/", async (req, res, next) => {
  try {
    const me = req.user!;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const range = from && to;
    const date = (req.query.date as string) ?? melbourneToday();

    // 懒物化：确保「今天」该上的 ACTIVE 班都有 lesson（新建班/数据跨天过期也能点名）。
    if ((range ? from! <= melbourneToday() && melbourneToday() <= to! : date === melbourneToday())) {
      const todayDow = melbourneDayOfWeek();
      const activeClasses = await prisma.class.findMany({
        where: {
          status: "ACTIVE",
          dayOfWeek: todayDow,
          ...(me.role === "TEACHER" ? { teacherId: me.id } : {}),
        },
        select: { id: true },
      });
      await Promise.all(activeClasses.map((c) => ensureLesson(c.id, melbourneToday())));
    }

    const where: any = range ? { date: { gte: from, lte: to } } : { date };
    if (me.role === "TEACHER") {
      where.class = { teacherId: me.id };
    }

    const lessons = await prisma.lesson.findMany({
      where,
      include: {
        class: {
          include: {
            teacher: { select: { id: true, name: true } },
            _count: { select: { members: { where: { status: "ACTIVE" } } } },
          },
        },
        _count: { select: { attendances: true } },
      },
      orderBy: [{ date: "asc" }, { class: { startTime: "asc" } }],
    });

    res.json(range ? { from, to, lessons: lessons.map(toSummary) } : { date, lessons: lessons.map(toSummary) });
  } catch (e) {
    next(e);
  }
});

// 课堂详情：名单（含 ⭐新学生标记）+ 每人出勤 + 反馈 + 剩余课时。
lessonsRouter.get("/:id", async (req, res, next) => {
  try {
    const me = req.user!;
    const lesson = await prisma.lesson.findUnique({
      where: { id: req.params.id },
      include: {
        class: { include: { teacher: { select: { id: true, name: true } } } },
        attendances: true,
        feedbacks: true,
      },
    });
    if (!lesson) throw new HttpError(404, "课不存在");

    // 权限：teacher 只能看自己的课；admin 全可看
    if (me.role === "TEACHER" && lesson.class.teacherId !== me.id) {
      throw new HttpError(403, "只能查看自己的课程");
    }

    const members = await prisma.classEnrollment.findMany({
      where: { classId: lesson.classId, status: "ACTIVE" },
      include: {
        student: {
          include: {
            enrollments: {
              where: { status: "ACTIVE" },
              select: { creditsRemaining: true },
            },
          },
        },
      },
      orderBy: { enrolledAt: "asc" },
    });

    const lessonDateMs = new Date(lesson.date + "T00:00:00").getTime();
    const roster = members.map((m) => {
      const attendance = lesson.attendances.find((a) => a.studentId === m.studentId);
      const feedback = lesson.feedbacks.find((f) => f.studentId === m.studentId);
      const isNew = lessonDateMs - new Date(m.enrolledAt).getTime() <= 14 * DAY_MS;
      return {
        student: {
          id: m.student.id,
          name: m.student.name,
          level: m.student.level,
          isNew,
          remainingCredits: m.student.enrollments.reduce(
            (s, e) => s + e.creditsRemaining,
            0
          ),
        },
        attendance: attendance
          ? {
              status: attendance.status,
              creditsDeducted: attendance.creditsDeducted,
              recordedAt: attendance.recordedAt,
            }
          : null,
        feedback: feedback
          ? {
              summary: feedback.summary,
              strengths: feedback.strengths,
              nextSteps: feedback.nextSteps,
              generatedBy: feedback.generatedBy,
            }
          : null,
      };
    });

    res.json({
      lesson: {
        id: lesson.id,
        date: lesson.date,
        status: lesson.status,
        class: {
          id: lesson.class.id,
          name: lesson.class.name,
          subject: lesson.class.subject,
          level: lesson.class.level,
          startTime: lesson.class.startTime,
          endTime: lesson.class.endTime,
          teacher: lesson.class.teacher,
        },
        roster,
      },
    });
  } catch (e) {
    next(e);
  }
});

const attendanceSchema = z.object({
  studentId: z.string().min(1),
  status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]),
});

// 记录出勤（含扣课时）。规则 #2/#4：余额不足拒绝、同一课同一生只一条、扣课时与出勤原子。
lessonsRouter.post("/:id/attendances", async (req, res, next) => {
  try {
    const me = req.user!;
    const { studentId, status } = attendanceSchema.parse(req.body);
    const lesson = await prisma.lesson.findUnique({
      where: { id: req.params.id },
      include: { class: true },
    });
    if (!lesson) throw new HttpError(404, "课不存在");
    if (me.role !== "TEACHER" || lesson.class.teacherId !== me.id) {
      throw new HttpError(403, "只有本班老师可以记出勤");
    }

    const membership = await prisma.classEnrollment.findUnique({
      where: { classId_studentId: { classId: lesson.classId, studentId } },
    });
    if (!membership || membership.status !== "ACTIVE") {
      throw new HttpError(400, "该学生不在本班名单中");
    }

    // 扣课时 + 写出勤在同一事务；并发双击时第二个请求的 create 触发 UNIQUE 冲突、整事务回滚。
    const result = await prisma.$transaction((tx) =>
      recordAttendance(tx, {
        lessonId: lesson.id,
        studentId,
        status,
        recordedById: me.id,
      })
    );

    res
      .status(result.created ? 201 : 200)
      .json({ attendance: result.attendance, deducted: result.deducted });
  } catch (e) {
    // 并发重复：另一请求已写入并扣费，本请求的扣费已随事务回滚，幂等返回。
    if ((e as any)?.code === "P2002") {
      const { studentId } = req.body as { studentId: string };
      const existing = await prisma.attendance.findUnique({
        where: {
          lessonId_studentId: { lessonId: req.params.id, studentId },
        },
      });
      return res.json({ attendance: existing, deducted: false });
    }
    next(e);
  }
});

// 全员出勤：逐个标记 PRESENT，余额不足的跳过并返回原因。
lessonsRouter.post("/:id/attendance/mark-all", async (req, res, next) => {
  try {
    const me = req.user!;
    const lesson = await prisma.lesson.findUnique({
      where: { id: req.params.id },
      include: { class: true },
    });
    if (!lesson) throw new HttpError(404, "课不存在");
    if (me.role !== "TEACHER" || lesson.class.teacherId !== me.id) {
      throw new HttpError(403, "只有本班老师可以记出勤");
    }

    const members = await prisma.classEnrollment.findMany({
      where: { classId: lesson.classId, status: "ACTIVE" },
      include: { student: true },
    });

    // 整个点名流程放一个事务：任一学生扣课时/写出勤失败即整体回滚（余额不足的跳过）。
    const { marked, skipped } = await prisma.$transaction(async (tx) => {
      const marked: string[] = [];
      const skipped: string[] = [];
      for (const m of members) {
        try {
          await recordAttendance(tx, {
            lessonId: lesson.id,
            studentId: m.studentId,
            status: "PRESENT",
            recordedById: me.id,
          });
          marked.push(m.student.name);
        } catch (e) {
          if ((e as any)?.status === 409) {
            skipped.push(m.student.name); // 课时不足
          } else {
            throw e;
          }
        }
      }
      return { marked, skipped };
    });

    res.json({ marked, skipped });
  } catch (e) {
    next(e);
  }
});

// 用 LLM 生成反馈草稿（structured output + 服务端校验 + 失败降级）。
lessonsRouter.post("/:id/feedback/generate", async (req, res, next) => {
  try {
    const me = req.user!;
    const { studentId } = z.object({ studentId: z.string().min(1) }).parse(req.body);
    const lesson = await prisma.lesson.findUnique({
      where: { id: req.params.id },
      include: { class: true },
    });
    if (!lesson) throw new HttpError(404, "课不存在");
    if (me.role !== "TEACHER" || lesson.class.teacherId !== me.id) {
      throw new HttpError(403, "只有本班老师可以生成反馈");
    }

    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new HttpError(404, "学生不存在");

    const recent = await prisma.lessonFeedback.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      take: 3,
    });
    const attendance = await prisma.attendance.findUnique({
      where: { lessonId_studentId: { lessonId: lesson.id, studentId } },
    });

    const result = await generateFeedbackDraft({
      studentName: student.name,
      subject: lesson.class.subject || lesson.class.name,
      level: student.level || "未知",
      attendance: attendance ? attendance.status : "未记录",
      recentNotes: recent.map((f) => f.summary).join(" | "),
    });

    res.json(result);
  } catch (e) {
    next(e);
  }
});

// 保存反馈（人工或 LLM 生成的草稿，经用户确认后落库）。
const feedbackSchema = z.object({
  studentId: z.string().min(1),
  summary: z.string().min(1),
  strengths: z.string().optional(),
  nextSteps: z.string().optional(),
  generatedBy: z.enum(["LLM", "MANUAL"]).default("MANUAL"),
});

lessonsRouter.post("/:id/feedback", async (req, res, next) => {
  try {
    const me = req.user!;
    const data = feedbackSchema.parse(req.body);
    const lesson = await prisma.lesson.findUnique({
      where: { id: req.params.id },
      include: { class: true },
    });
    if (!lesson) throw new HttpError(404, "课不存在");
    if (me.role !== "TEACHER" || lesson.class.teacherId !== me.id) {
      throw new HttpError(403, "只有本班老师可以写反馈");
    }

    const membership = await prisma.classEnrollment.findUnique({
      where: { classId_studentId: { classId: lesson.classId, studentId: data.studentId } },
    });
    if (!membership || membership.status !== "ACTIVE") {
      throw new HttpError(400, "该学生不在本班名单中");
    }

    const feedback = await prisma.lessonFeedback.upsert({
      where: {
        lessonId_studentId: { lessonId: lesson.id, studentId: data.studentId },
      },
      update: {
        summary: data.summary,
        strengths: data.strengths,
        nextSteps: data.nextSteps,
        generatedBy: data.generatedBy,
      },
      create: {
        lessonId: lesson.id,
        studentId: data.studentId,
        summary: data.summary,
        strengths: data.strengths,
        nextSteps: data.nextSteps,
        generatedBy: data.generatedBy,
      },
    });

    res.status(201).json({ feedback });
  } catch (e) {
    next(e);
  }
});
