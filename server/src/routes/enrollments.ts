import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { HttpError, assertCanWriteStudent, requireAuth, requireRole } from "../middleware";

export const enrollmentsRouter = Router();

enrollmentsRouter.use(requireAuth);

const createSchema = z.object({
  credits: z.number().int().min(1).max(500),
  note: z.string().optional(),
});

// 报名 / 续费：给学生购买课时（一节课 = 1 课时）。
enrollmentsRouter.post(
  "/students/:id/enrollments",
  requireRole("ADMIN"),
  async (req, res, next) => {
    try {
      const { credits, note } = createSchema.parse(req.body);
      const student = await prisma.student.findUnique({
        where: { id: req.params.id },
      });
      if (!student) throw new HttpError(404, "学生不存在");
      assertCanWriteStudent(req.user!, student.adminId);

      const enrollment = await prisma.$transaction(async (tx) => {
        const created = await tx.enrollment.create({
          data: {
            studentId: student.id,
            creditsTotal: credits,
            creditsRemaining: credits,
            note,
          },
        });
        // 购买课时即视为已报名（学生可能之前是 LEAD/试听状态）
        await tx.student.update({
          where: { id: student.id },
          data: { status: "ENROLLED" },
        });
        return created;
      });

      res.status(201).json({ enrollment });
    } catch (e) {
      next(e);
    }
  }
);
