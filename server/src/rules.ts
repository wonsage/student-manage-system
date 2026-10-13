import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { HttpError } from "./middleware";
import { timeToMinutes } from "./time";

/**
 * 规则 #1：排课时间冲突。
 * 两个班冲突 ⇔ 同一天（dayOfWeek 相同）且时间区间 [start, end) 相交。
 */
export function timesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  const aS = timeToMinutes(aStart);
  const aE = timeToMinutes(aEnd);
  const bS = timeToMinutes(bStart);
  const bE = timeToMinutes(bEnd);
  // 半开区间 [start, end)：刚好首尾相接不算冲突。
  return aS < bE && bS < aE;
}

/** 学生在指定班级的成员关系（含班级排期），用于冲突/容量检查。 */
export async function getStudentActiveClasses(studentId: string) {
  const memberships = await prisma.classEnrollment.findMany({
    where: { studentId, status: "ACTIVE" },
    include: { class: true },
  });
  return memberships
    .map((m) => m.class)
    .filter((c) => c.status === "ACTIVE");
}

/**
 * 规则 #1（服务端）：学生不能被排进时间重叠的两个班。
 * 若冲突，抛出 409，附上冲突班级名。
 */
export async function assertNoTimeConflict(
  studentId: string,
  target: { dayOfWeek: number; startTime: string; endTime: string },
  excludeClassId?: string
) {
  const existing = await getStudentActiveClasses(studentId);
  for (const c of existing) {
    if (excludeClassId && c.id === excludeClassId) continue;
    if (c.dayOfWeek !== target.dayOfWeek) continue;
    if (timesOverlap(c.startTime, c.endTime, target.startTime, target.endTime)) {
      throw new HttpError(
        409,
        `排课冲突：学生已被排进「${c.name}」（${c.startTime}-${c.endTime}），时间重叠`
      );
    }
  }
}

/** 学生剩余总课时 = 各 ACTIVE Enrollment 的 creditsRemaining 之和。 */
export async function getRemainingCredits(studentId: string): Promise<number> {
  const aggs = await prisma.enrollment.aggregate({
    where: { studentId, status: "ACTIVE" },
    _sum: { creditsRemaining: true },
  });
  return aggs._sum.creditsRemaining ?? 0;
}

/**
 * 规则 #2：课时不足拦截。剩余课时 <= 0 时不能排进正式班级。
 */
export async function assertHasCredits(studentId: string) {
  const remaining = await getRemainingCredits(studentId);
  if (remaining <= 0) {
    throw new HttpError(409, "课时不足：该学生剩余课时为 0，请先续费");
  }
  return remaining;
}

/**
 * 规则 #3：只有 ENROLLED 状态的学生才能排进正式班级。
 */
export function assertEnrollable(status: string) {
  if (status !== "ENROLLED") {
    throw new HttpError(
      409,
      "只有已报名（ENROLLED）的学生才能排进正式班级，请先完成报名"
    );
  }
}

/**
 * 规则 #6：班级容量。ACTIVE 成员数达到 capacity 即满员。
 */
export async function assertClassCapacity(classId: string) {
  const cls = await prisma.class.findUnique({ where: { id: classId } });
  if (!cls) throw new HttpError(404, "班级不存在");
  const count = await prisma.classEnrollment.count({
    where: { classId, status: "ACTIVE" },
  });
  if (count >= cls.capacity) {
    throw new HttpError(409, `班级「${cls.name}」已满（${cls.capacity} 人）`);
  }
  return cls;
}

/**
 * 规则 #2（扣减核心）：在给定事务中扣 1 课时。
 *
 * 并发安全靠「条件更新」而非「先查再改」：
 * - findFirst 只负责选出「扣哪个账户」（FIFO，先扣最早买的）；
 * - updateMany 的 WHERE 里带 `creditsRemaining > 0`，两个并发请求同时扣同一账户时，
 *   第二个请求的条件更新 count=0 → 返回 null（课时不足），不会把余额扣成负数。
 * 扣到 0 自动置 EXHAUSTED。
 *
 * 返回扣减后的 enrollment（null 表示余额不足）。
 * 注意：必须由调用方在同一事务里完成「写出勤记录」，保证扣课时与出勤原子。
 * 同时在同一事务里写一条 DEDUCT 课时流水（切片③），保证账实一致。
 */
export async function deductOneCreditTx(
  tx: Prisma.TransactionClient,
  studentId: string,
  opts: { lessonId?: string; note?: string } = {}
) {
  const enrollment = await tx.enrollment.findFirst({
    where: { studentId, status: "ACTIVE", creditsRemaining: { gt: 0 } },
    orderBy: { purchasedAt: "asc" }, // 先扣最早买的
  });
  if (!enrollment) return null;

  // 条件更新：仅当余额仍 > 0 时才扣，防并发扣成负数。
  const decremented = await tx.enrollment.updateMany({
    where: { id: enrollment.id, creditsRemaining: { gt: 0 } },
    data: { creditsRemaining: { decrement: 1 } },
  });
  if (decremented.count === 0) return null; // 被并发扣光

  // 扣到 0 自动置 EXHAUSTED
  await tx.enrollment.updateMany({
    where: { id: enrollment.id, creditsRemaining: 0, status: "ACTIVE" },
    data: { status: "EXHAUSTED" },
  });

  const after = await tx.enrollment.findUnique({ where: { id: enrollment.id } });
  if (!after) return null;

  // 课时流水（DEDUCT -1），与扣减同事务；balanceAfter 记扣后余额。
  await tx.creditTransaction.create({
    data: {
      studentId,
      enrollmentId: after.id,
      lessonId: opts.lessonId ?? null,
      type: "DEDUCT",
      amount: -1,
      balanceAfter: after.creditsRemaining,
      note: opts.note,
    },
  });

  return after;
}
