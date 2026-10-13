import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { studentsRouter } from "./routes/students";
import { classesRouter } from "./routes/classes";
import { enrollmentsRouter } from "./routes/enrollments";
import { lessonsRouter } from "./routes/lessons";
import { prisma } from "./db";
import { HttpError, requireAuth } from "./middleware";

const app = express();
app.use(cors());
app.use(express.json());

// 简单健康检查
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Admin 工作台概览（登录后第一眼要看到的数据）。
app.get("/api/dashboard", requireAuth, async (req, res, next) => {
  try {
    const me = req.user!;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [myStudents, pendingTrial, lowCredits, newThisWeek] =
      await Promise.all([
        prisma.student.count({ where: { adminId: me.id } }),
        prisma.student.count({
          where: { adminId: me.id, status: "TRIAL_DONE" },
        }),
        // 快用完课时：有 ACTIVE 报名且总余额 <= 2 且 > 0
        prisma.student.count({
          where: {
            adminId: me.id,
            status: "ENROLLED",
            enrollments: {
              some: {
                status: "ACTIVE",
                creditsRemaining: { gt: 0, lte: 2 },
              },
            },
          },
        }),
        prisma.student.count({
          where: { adminId: me.id, createdAt: { gte: weekAgo } },
        }),
      ]);

    res.json({
      stats: { myStudents, pendingTrial, lowCredits, newThisWeek },
    });
  } catch (e) {
    next(e);
  }
});

// 老师列表（admin 建班时选择）
app.get("/api/teachers", requireAuth, async (_req, res, next) => {
  try {
    const teachers = await prisma.user.findMany({
      where: { role: "TEACHER" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    res.json({ teachers });
  } catch (e) {
    next(e);
  }
});

app.use("/api/auth", authRouter);
app.use("/api/students", studentsRouter);
app.use("/api", enrollmentsRouter);
app.use("/api/classes", classesRouter);
app.use("/api/lessons", lessonsRouter);

// 统一错误处理
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    // zod 校验错误
    if (err?.name === "ZodError") {
      return res.status(400).json({ error: "请求参数不合法", details: err.issues });
    }
    console.error(err);
    res.status(500).json({ error: "服务器内部错误" });
  }
);

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
