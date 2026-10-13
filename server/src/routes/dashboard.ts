import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware";
import { melbourneDateOf, melbourneToday } from "../time";

// Admin 工作台聚合接口：核心指标 + 趋势图数据（报名趋势/课时消耗/状态分布/出勤率）。
export const dashboardRouter = Router();

dashboardRouter.use(requireAuth, requireRole("ADMIN"));

const DAY_MS = 24 * 60 * 60 * 1000;

/** 生成最近 N 天的 Melbourne 日期序列（含今天，升序）。 */
function lastNDays(n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    days.push(melbourneDateOf(new Date(Date.now() - i * DAY_MS)));
  }
  return days;
}

dashboardRouter.get("/", async (req, res, next) => {
  try {
    const me = req.user!;
    const now = Date.now();
    const weekAgo = new Date(now - 7 * DAY_MS);
    const days14Ago = new Date(now - 14 * DAY_MS);
    const days30Ago = new Date(now - 30 * DAY_MS);

    const [
      myStudents,
      enrolled,
      pendingTrial,
      lowCredits,
      newThisWeek,
      totalCreditsAgg,
      statusGroups,
      recentStudents,
      recentDeducts,
      attendanceStats,
    ] = await Promise.all([
      prisma.student.count({ where: { adminId: me.id } }),
      prisma.student.count({ where: { adminId: me.id, status: "ENROLLED" } }),
      prisma.student.count({ where: { adminId: me.id, status: "TRIAL_DONE" } }),
      prisma.student.count({
        where: {
          adminId: me.id,
          status: "ENROLLED",
          enrollments: { some: { status: "ACTIVE", creditsRemaining: { gt: 0, lte: 2 } } },
        },
      }),
      prisma.student.count({ where: { adminId: me.id, createdAt: { gte: weekAgo } } }),
      // 剩余课时总数（ACTIVE 报名）
      prisma.enrollment.aggregate({
        where: { status: "ACTIVE", student: { adminId: me.id } },
        _sum: { creditsRemaining: true },
      }),
      // 状态分布
      prisma.student.groupBy({
        by: ["status"],
        where: { adminId: me.id },
        _count: { status: true },
      }),
      // 近 14 天新增学生（报名趋势）
      prisma.student.findMany({
        where: { adminId: me.id, createdAt: { gte: days14Ago } },
        select: { createdAt: true },
      }),
      // 近 14 天扣课时流水（课时消耗）
      prisma.creditTransaction.findMany({
        where: { type: "DEDUCT", student: { adminId: me.id }, createdAt: { gte: days14Ago } },
        select: { createdAt: true },
      }),
      // 近 30 天出勤（出勤率）
      prisma.attendance.findMany({
        where: { student: { adminId: me.id }, recordedAt: { gte: days30Ago } },
        select: { status: true },
      }),
    ]);

    // 报名趋势：按 Melbourne 日聚合
    const days = lastNDays(14);
    const enrollByDay = new Map<string, number>();
    for (const s of recentStudents) enrollByDay.set(melbourneDateOf(s.createdAt), (enrollByDay.get(melbourneDateOf(s.createdAt)) ?? 0) + 1);
    const enrollmentTrend = days.map((d) => ({ date: d, count: enrollByDay.get(d) ?? 0 }));

    // 课时消耗：按 Melbourne 日聚合
    const deductByDay = new Map<string, number>();
    for (const t of recentDeducts) deductByDay.set(melbourneDateOf(t.createdAt), (deductByDay.get(melbourneDateOf(t.createdAt)) ?? 0) + 1);
    const creditConsumption = days.map((d) => ({ date: d, count: deductByDay.get(d) ?? 0 }));

    // 出勤率
    const total = attendanceStats.length;
    const present = attendanceStats.filter((a) => a.status === "PRESENT").length;
    const attendanceRate = total > 0 ? present / total : 0;

    const statusDistribution = statusGroups.map((g) => ({ status: g.status, count: g._count.status }));

    res.json({
      today: melbourneToday(),
      stats: {
        myStudents,
        enrolled,
        pendingTrial,
        lowCredits,
        newThisWeek,
        totalCredits: totalCreditsAgg._sum.creditsRemaining ?? 0,
        attendanceRate,
      },
      enrollmentTrend,
      creditConsumption,
      statusDistribution,
    });
  } catch (e) {
    next(e);
  }
});
