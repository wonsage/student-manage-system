import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { HttpError, assertCanWriteStudent, requireAuth, requireRole } from "../middleware";
import { melbourneDateOf, melbourneToday } from "../time";

// 切片②：学生跟进 / 待办。
export const followupsRouter = Router();

followupsRouter.use(requireAuth);

const createSchema = z.object({
  type: z.enum(["CALL", "WECHAT", "MEETING", "TRIAL", "OTHER"]),
  content: z.string().min(1),
  nextFollowUpAt: z.string().optional(), // "YYYY-MM-DD"（Melbourne 业务日）
});

// 记录一次跟进（顾问本人名下）。
followupsRouter.post(
  "/students/:id/followups",
  requireRole("ADMIN"),
  async (req, res, next) => {
    try {
      const data = createSchema.parse(req.body);
      const student = await prisma.student.findUnique({
        where: { id: req.params.id },
      });
      if (!student) throw new HttpError(404, "学生不存在");
      assertCanWriteStudent(req.user!, student.adminId);

      const nextFollowUpAt = data.nextFollowUpAt
        ? new Date(`${data.nextFollowUpAt}T00:00:00Z`)
        : null;

      const followUp = await prisma.followUp.create({
        data: {
          studentId: student.id,
          adminId: req.user!.id,
          type: data.type,
          content: data.content,
          nextFollowUpAt,
        },
      });
      res.status(201).json({ followUp });
    } catch (e) {
      next(e);
    }
  }
);

// 今日待跟进清单：自动识别（试听待跟进 / 快用完课时）+ 手动设置的到期跟进。
followupsRouter.get("/followups/today", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const me = req.user!;
    const today = melbourneToday();

    const [pendingTrial, lowCredits, followUps] = await Promise.all([
      // 1) 试听完待跟进：TRIAL_DONE
      prisma.student.findMany({
        where: { adminId: me.id, status: "TRIAL_DONE" },
        select: { id: true, name: true, status: true, level: true },
        orderBy: { updatedAt: "desc" },
      }),
      // 2) 快用完课时：ENROLLED 且有 ACTIVE 报名余额 1~2
      prisma.student.findMany({
        where: {
          adminId: me.id,
          status: "ENROLLED",
          enrollments: {
            some: { status: "ACTIVE", creditsRemaining: { gt: 0, lte: 2 } },
          },
        },
        include: {
          enrollments: {
            where: { status: "ACTIVE" },
            select: { creditsRemaining: true },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
      // 3) 手动设置的到期跟进
      prisma.followUp.findMany({
        where: { adminId: me.id, completed: false, nextFollowUpAt: { not: null } },
        include: { student: { select: { id: true, name: true, status: true } } },
        orderBy: { nextFollowUpAt: "asc" },
      }),
    ]);

    // 到期判断：nextFollowUpAt 的 Melbourne 日期 <= 今天（用本地时区格式化比较，避免时区漂移）。
    const dueFollowUps = followUps
      .filter((f) => f.nextFollowUpAt && melbourneDateOf(f.nextFollowUpAt) <= today)
      .map((f) => ({
        id: f.id,
        studentId: f.studentId,
        studentName: f.student.name,
        studentStatus: f.student.status,
        type: f.type,
        content: f.content,
        nextFollowUpAt: f.nextFollowUpAt,
      }));

    const lowCreditsList = lowCredits.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      level: s.level,
      remainingCredits: s.enrollments.reduce((sum, e) => sum + e.creditsRemaining, 0),
    }));

    res.json({ date: today, pendingTrial, lowCredits: lowCreditsList, dueFollowUps });
  } catch (e) {
    next(e);
  }
});
