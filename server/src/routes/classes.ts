import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { HttpError, requireAuth, requireRole } from "../middleware";
import { timeToMinutes } from "../time";
import {
  assertCanWriteStudent,
} from "../middleware";
import {
  assertClassCapacity,
  assertEnrollable,
  assertHasCredits,
  assertNoTimeConflict,
  timesOverlap,
} from "../rules";

export const classesRouter = Router();

classesRouter.use(requireAuth);

const createClassSchema = z.object({
  name: z.string().min(1),
  subject: z.string().optional(),
  level: z.string().optional(),
  teacherId: z.string().min(1),
  dayOfWeek: z.number().int().min(1).max(7),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  capacity: z.number().int().min(1).max(50).default(10),
});

// 列表：admin 全部 / teacher 只看自己的班。
classesRouter.get("/", async (req, res, next) => {
  try {
    const me = req.user!;
    const where: any = { status: "ACTIVE" };
    if (me.role === "TEACHER") where.teacherId = me.id;

    const classes = await prisma.class.findMany({
      where,
      include: {
        teacher: { select: { id: true, name: true } },
        _count: { select: { members: { where: { status: "ACTIVE" } } } },
      },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });

    res.json({
      classes: classes.map((c) => ({
        id: c.id,
        name: c.name,
        subject: c.subject,
        level: c.level,
        teacher: c.teacher,
        dayOfWeek: c.dayOfWeek,
        startTime: c.startTime,
        endTime: c.endTime,
        capacity: c.capacity,
        memberCount: c._count.members,
      })),
    });
  } catch (e) {
    next(e);
  }
});

// 规则 #7：老师不能同时带两个时间重叠的班。
async function assertTeacherAvailable(
  teacherId: string,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  excludeClassId?: string
) {
  const existing = await prisma.class.findMany({
    where: { teacherId, status: "ACTIVE", dayOfWeek },
  });
  for (const c of existing) {
    if (excludeClassId && c.id === excludeClassId) continue;
    if (timesOverlap(c.startTime, c.endTime, startTime, endTime)) {
      throw new HttpError(
        409,
        `老师时间冲突：该老师已在「${c.name}」（${c.startTime}-${c.endTime}）有课`
      );
    }
  }
}

classesRouter.post("/", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const data = createClassSchema.parse(req.body);
    if (timeToMinutes(data.endTime) <= timeToMinutes(data.startTime)) {
      throw new HttpError(400, "结束时间必须晚于开始时间");
    }
    await assertTeacherAvailable(
      data.teacherId,
      data.dayOfWeek,
      data.startTime,
      data.endTime
    );
    const cls = await prisma.class.create({
      data,
      include: { teacher: { select: { id: true, name: true } } },
    });
    res.status(201).json({ class: cls });
  } catch (e) {
    next(e);
  }
});

classesRouter.get("/:id", async (req, res, next) => {
  try {
    const cls = await prisma.class.findUnique({
      where: { id: req.params.id },
      include: {
        teacher: { select: { id: true, name: true } },
        members: {
          where: { status: "ACTIVE" },
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
        },
      },
    });
    if (!cls) throw new HttpError(404, "班级不存在");
    res.json({ class: cls });
  } catch (e) {
    next(e);
  }
});

// 排班：把学生加进班级（规则 1/2/3/6 在此集中执行）。
classesRouter.post("/:id/members", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const body = z.object({ studentId: z.string().min(1) }).parse(req.body);
    const student = await prisma.student.findUnique({ where: { id: body.studentId } });
    if (!student) throw new HttpError(404, "学生不存在");
    assertCanWriteStudent(req.user!, student.adminId);

    const cls = await assertClassCapacity(req.params.id);
    assertEnrollable(student.status);
    await assertNoTimeConflict(student.id, {
      dayOfWeek: cls.dayOfWeek,
      startTime: cls.startTime,
      endTime: cls.endTime,
    });
    await assertHasCredits(student.id);

    const existing = await prisma.classEnrollment.findUnique({
      where: { classId_studentId: { classId: cls.id, studentId: student.id } },
    });
    if (existing) {
      if (existing.status === "ACTIVE") {
        throw new HttpError(409, `学生已在「${cls.name}」中`);
      }
      // 之前退出的，重新激活
      const updated = await prisma.classEnrollment.update({
        where: { id: existing.id },
        data: { status: "ACTIVE" },
      });
      return res.json({ membership: updated });
    }

    const membership = await prisma.classEnrollment.create({
      data: { classId: cls.id, studentId: student.id },
    });
    res.status(201).json({ membership });
  } catch (e) {
    next(e);
  }
});
