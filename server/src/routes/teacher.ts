import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware";
import { melbourneDate, melbourneToday } from "../time";

// Teacher 工作台聚合：今日/本周课程数、所教学生数、待点名数。
export const teacherRouter = Router();

teacherRouter.use(requireAuth, requireRole("TEACHER"));

teacherRouter.get("/overview", async (req, res, next) => {
  try {
    const me = req.user!;
    const today = melbourneToday();
    const weekEnd = melbourneDate(6); // 未来 7 天（含今天）

    const [todayLessons, weekCount, myStudentRows] = await Promise.all([
      prisma.lesson.findMany({
        where: { date: today, class: { teacherId: me.id, status: "ACTIVE" } },
        include: {
          class: { include: { _count: { select: { members: { where: { status: "ACTIVE" } } } } } },
          _count: { select: { attendances: true } },
        },
      }),
      prisma.lesson.count({
        where: {
          date: { gte: today, lte: weekEnd },
          class: { teacherId: me.id, status: "ACTIVE" },
        },
      }),
      prisma.classEnrollment.findMany({
        where: { class: { teacherId: me.id, status: "ACTIVE" }, status: "ACTIVE" },
        distinct: ["studentId"],
        select: { studentId: true },
      }),
    ]);

    const myStudents = myStudentRows.length;
    const pendingAttendance = todayLessons.reduce((sum, l) => {
      const members = l.class._count.members;
      const recorded = l._count.attendances;
      return sum + Math.max(0, members - recorded);
    }, 0);

    res.json({
      today,
      todayCount: todayLessons.length,
      weekCount,
      myStudents,
      pendingAttendance,
    });
  } catch (e) {
    next(e);
  }
});
