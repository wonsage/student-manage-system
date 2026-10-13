import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth";
import { studentsRouter } from "./routes/students";
import { classesRouter } from "./routes/classes";
import { enrollmentsRouter } from "./routes/enrollments";
import { lessonsRouter } from "./routes/lessons";
import { followupsRouter } from "./routes/followups";
import { dashboardRouter } from "./routes/dashboard";
import { teacherRouter } from "./routes/teacher";
import { prisma } from "./db";
import { HttpError, requireAuth } from "./middleware";
import { melbourneToday, melbourneDayOfWeek } from "./time";

// Express app 单独导出，供本地 index.ts（listen）和 Vercel api/index.ts（serverless）共用。
export const app = express();
app.use(cors());
app.use(express.json());

// 简单健康检查
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// 业务「今天」元信息（前端日历/工作台统一锚点）。
app.get("/api/meta", (_req, res) => {
  res.json({ today: melbourneToday(), dayOfWeek: melbourneDayOfWeek() });
});

// Admin 工作台概览（登录后第一眼要看到的数据）。
app.use("/api/dashboard", dashboardRouter);

// Teacher 工作台聚合。
app.use("/api/teacher", teacherRouter);

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
app.use("/api", followupsRouter);
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
