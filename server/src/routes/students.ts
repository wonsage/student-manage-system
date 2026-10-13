import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { HttpError, assertCanWriteStudent, requireAuth, requireRole } from "../middleware";
import { getRemainingCredits } from "../rules";

export const studentsRouter = Router();

studentsRouter.use(requireAuth);

const createSchema = z.object({
  name: z.string().min(1),
  nickname: z.string().optional(),
  guardianName: z.string().optional(),
  guardianPhone: z.string().optional(),
  phone: z.string().optional(),
  level: z.string().optional(),
  note: z.string().optional(),
});

// 列表：admin 可读全部（?scope=all）或只看自己（?scope=mine，默认）；teacher 只看自己班里的学生。
studentsRouter.get("/", async (req, res, next) => {
  try {
    const me = req.user!;
    const scope = (req.query.scope as string) ?? "mine";
    const status = req.query.status as string | undefined;
    const q = (req.query.q as string) ?? "";

    const where: any = {};
    if (me.role === "ADMIN") {
      if (scope !== "all") where.adminId = me.id;
    } else {
      // teacher：只看到自己名下班级的成员
      where.memberships = { some: { class: { teacherId: me.id }, status: "ACTIVE" } };
    }
    if (status) where.status = status;
    if (q) where.name = { contains: q };

    const students = await prisma.student.findMany({
      where,
      include: {
        admin: { select: { id: true, name: true } },
        enrollments: {
          where: { status: "ACTIVE" },
          select: { creditsRemaining: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const enriched = students.map((s) => ({
      ...s,
      remainingCredits: s.enrollments.reduce(
        (sum, e) => sum + e.creditsRemaining,
        0
      ),
      enrollments: undefined,
    }));

    res.json({ students: enriched });
  } catch (e) {
    next(e);
  }
});

studentsRouter.post("/", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const student = await prisma.student.create({
      data: { ...data, adminId: req.user!.id, status: "LEAD" },
      include: { admin: { select: { id: true, name: true } } },
    });
    res.status(201).json({ student });
  } catch (e) {
    next(e);
  }
});

// 详情：admin 可读全部；teacher 只能读自己班里学生。
studentsRouter.get("/:id", async (req, res, next) => {
  try {
    const me = req.user!;
    const student = await prisma.student.findUnique({
      where: { id: req.params.id },
      include: {
        admin: { select: { id: true, name: true } },
        enrollments: { orderBy: { purchasedAt: "desc" } },
        memberships: {
          where: { status: "ACTIVE" },
          include: { class: { include: { teacher: { select: { name: true } } } } },
        },
        feedbacks: {
          orderBy: { createdAt: "desc" },
          include: { lesson: { include: { class: { select: { name: true } } } } },
          take: 10,
        },
      },
    });
    if (!student) throw new HttpError(404, "学生不存在");

    if (me.role === "TEACHER") {
      const allowed = await prisma.classEnrollment.findFirst({
        where: {
          studentId: student.id,
          class: { teacherId: me.id },
          status: "ACTIVE",
        },
      });
      if (!allowed) throw new HttpError(403, "没有权限查看该学生");
    }

    const remainingCredits = await getRemainingCredits(student.id);
    res.json({ student: { ...student, remainingCredits } });
  } catch (e) {
    next(e);
  }
});

const updateSchema = createSchema.partial().extend({
  status: z
    .enum(["LEAD", "TRIAL_SCHEDULED", "TRIAL_DONE", "ENROLLED", "CHURNED"])
    .optional(),
});

studentsRouter.patch("/:id", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const student = await prisma.student.findUnique({ where: { id: req.params.id } });
    if (!student) throw new HttpError(404, "学生不存在");
    assertCanWriteStudent(req.user!, student.adminId);

    const data = updateSchema.parse(req.body);
    const updated = await prisma.student.update({
      where: { id: student.id },
      data,
      include: { admin: { select: { id: true, name: true } } },
    });
    res.json({ student: updated });
  } catch (e) {
    next(e);
  }
});
