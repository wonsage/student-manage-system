import "dotenv/config";
import { PrismaClient, Role, StudentStatus, FollowUpType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { melbourneDate, melbourneToday } from "../src/time";

const prisma = new PrismaClient();

const DAY_MS = 24 * 60 * 60 * 1000;

/** 把 "YYYY-MM-DD" 转成 ISO-8601 星期几（1=Mon .. 7=Sun）。 */
function dowOfDate(date: string): number {
  const d = new Date(date + "T00:00:00Z");
  return ((d.getUTCDay() + 6) % 7) + 1;
}

/** 确定性伪随机：同一 seed 每次跑结果一致。 */
function seeded(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

interface StudentSeed {
  name: string;
  nickname?: string;
  adminIdx: number;
  status: StudentStatus;
  level: string;
  daysAgo: number; // 建线索距今多少天
  note?: string;
  /** 报名课时包：初始购买课时数（仅 ENROLLED 有效） */
  pack?: number;
  /** 历史实际出勤（扣课）次数，决定最终剩余 = pack - historyPresent */
  historyPresent?: number;
  /** 续费课时数（额外再加一条报名） */
  renewal?: number;
}

const STUDENTS: StudentSeed[] = [
  // ── 王丽（admin 0，演示主角）──
  { name: "张小明", nickname: "小明", adminIdx: 0, status: "ENROLLED", level: "Year 8", daysAgo: 45, pack: 20, historyPresent: 6 },
  { name: "李小红", nickname: "小红", adminIdx: 0, status: "ENROLLED", level: "Year 8", daysAgo: 45, pack: 20, historyPresent: 5 },
  { name: "王小刚", adminIdx: 0, status: "ENROLLED", level: "Year 9", daysAgo: 40, pack: 8, historyPresent: 7, note: "剩余 1 课时，需续费" },
  { name: "周小杰", adminIdx: 0, status: "ENROLLED", level: "Year 9", daysAgo: 60, pack: 6, historyPresent: 6, note: "课时已用完（演示扣课拦截）" },
  { name: "陈小美", adminIdx: 0, status: "TRIAL_DONE", level: "Year 7", daysAgo: 5, note: "试听反馈良好，家长考虑报名" },
  { name: "赵小宇", adminIdx: 0, status: "TRIAL_DONE", level: "Year 8", daysAgo: 9 },
  { name: "孙小涵", adminIdx: 0, status: "LEAD", level: "Year 6", daysAgo: 1, note: "官网留资，尚未电话接通" },
  { name: "吴小琪", adminIdx: 0, status: "CHURNED", level: "Year 8", daysAgo: 70 },
  { name: "郑晓彤", adminIdx: 0, status: "ENROLLED", level: "Year 10", daysAgo: 12, pack: 20, historyPresent: 3 },
  { name: "冯子墨", adminIdx: 0, status: "TRIAL_SCHEDULED", level: "Year 7", daysAgo: 3 },
  { name: "许浩然", adminIdx: 0, status: "ENROLLED", level: "Year 6", daysAgo: 4, pack: 16, historyPresent: 4 },
  { name: "林小静", adminIdx: 0, status: "ENROLLED", level: "Year 9", daysAgo: 30, pack: 20, historyPresent: 8, renewal: 12 },
  // ── 李强（admin 1）──
  { name: "郑小峰", adminIdx: 1, status: "ENROLLED", level: "Year 10", daysAgo: 50, pack: 20, historyPresent: 3 },
  { name: "冯小燕", adminIdx: 1, status: "TRIAL_DONE", level: "Year 8", daysAgo: 6 },
  { name: "许小阳", adminIdx: 1, status: "ENROLLED", level: "Year 7", daysAgo: 35, pack: 20, historyPresent: 4 },
  { name: "罗小凡", adminIdx: 1, status: "TRIAL_DONE", level: "Year 7", daysAgo: 8 },
  { name: "高小雨", adminIdx: 1, status: "ENROLLED", level: "Year 8", daysAgo: 2, pack: 20, historyPresent: 3 },
  { name: "蒋小桐", adminIdx: 1, status: "LEAD", level: "Year 6", daysAgo: 2 },
  { name: "韩小磊", adminIdx: 1, status: "CHURNED", level: "Year 10", daysAgo: 80 },
  // ── 张敏（admin 2）──
  { name: "何小波", adminIdx: 2, status: "LEAD", level: "Year 6", daysAgo: 1 },
  { name: "唐小雅", adminIdx: 2, status: "ENROLLED", level: "Year 9", daysAgo: 40, pack: 20, historyPresent: 5 },
  { name: "曹小睿", adminIdx: 2, status: "ENROLLED", level: "Year 7", daysAgo: 25, pack: 20, historyPresent: 4 },
  { name: "邓小航", adminIdx: 2, status: "TRIAL_SCHEDULED", level: "Year 8", daysAgo: 5 },
  { name: "傅小欣", adminIdx: 2, status: "CHURNED", level: "Year 9", daysAgo: 65 },
  { name: "丁小翼", adminIdx: 2, status: "ENROLLED", level: "Year 10", daysAgo: 15, pack: 20, historyPresent: 3 },
  // ── 陈静（admin 3）──
  { name: "郭小甜", adminIdx: 3, status: "ENROLLED", level: "Year 8", daysAgo: 20, pack: 20, historyPresent: 4 },
  { name: "彭小宇", adminIdx: 3, status: "TRIAL_DONE", level: "Year 7", daysAgo: 7 },
  { name: "曾小轩", adminIdx: 3, status: "LEAD", level: "Year 6", daysAgo: 1 },
  { name: "萧小琳", adminIdx: 3, status: "ENROLLED", level: "Year 9", daysAgo: 28, pack: 20, historyPresent: 3 },
  { name: "沈小北", adminIdx: 3, status: "CHURNED", level: "Year 8", daysAgo: 55 },
];

interface ClassSeed {
  name: string;
  subject: string;
  teacherIdx: number;
  dayOfWeek: number; // 1=Mon .. 7=Sun
  start: string;
  end: string;
  capacity: number;
}

const CLASSES: ClassSeed[] = [
  { name: "数学 A 班", subject: "数学", teacherIdx: 0, dayOfWeek: 1, start: "15:30", end: "17:00", capacity: 10 },
  { name: "数学冲刺班", subject: "数学", teacherIdx: 1, dayOfWeek: 1, start: "17:00", end: "18:30", capacity: 8 },
  { name: "英语 A 班", subject: "英语", teacherIdx: 1, dayOfWeek: 2, start: "16:00", end: "17:30", capacity: 10 },
  { name: "数学 B 班", subject: "数学", teacherIdx: 0, dayOfWeek: 3, start: "15:30", end: "17:00", capacity: 10 },
  { name: "英语 B 班", subject: "英语", teacherIdx: 1, dayOfWeek: 4, start: "16:00", end: "17:30", capacity: 8 },
  { name: "科学 A 班", subject: "科学", teacherIdx: 2, dayOfWeek: 5, start: "18:00", end: "19:30", capacity: 12 },
  { name: "中文 A 班", subject: "中文", teacherIdx: 3, dayOfWeek: 6, start: "10:00", end: "11:30", capacity: 8 },
  { name: "物理 A 班", subject: "物理", teacherIdx: 0, dayOfWeek: 7, start: "14:00", end: "15:30", capacity: 10 },
];

/** 排班计划：studentName → [班级 idx]，enrolledAt 距今 daysAgo。 */
const MEMBERSHIPS: { student: string; classIdx: number; daysAgo: number }[] = [
  { student: "张小明", classIdx: 0, daysAgo: 45 },
  { student: "张小明", classIdx: 2, daysAgo: 40 },
  { student: "李小红", classIdx: 0, daysAgo: 45 },
  { student: "李小红", classIdx: 3, daysAgo: 40 },
  { student: "王小刚", classIdx: 0, daysAgo: 35 },
  { student: "王小刚", classIdx: 5, daysAgo: 6 }, // 新学生标记
  { student: "周小杰", classIdx: 0, daysAgo: 60 },
  { student: "周小杰", classIdx: 2, daysAgo: 55 },
  { student: "周小杰", classIdx: 3, daysAgo: 50 },
  { student: "郑晓彤", classIdx: 1, daysAgo: 12 },
  { student: "郑晓彤", classIdx: 4, daysAgo: 10 },
  { student: "许浩然", classIdx: 0, daysAgo: 4 }, // 新学生标记
  { student: "林小静", classIdx: 2, daysAgo: 28 },
  { student: "林小静", classIdx: 7, daysAgo: 20 },
  { student: "郑小峰", classIdx: 3, daysAgo: 45 },
  { student: "许小阳", classIdx: 2, daysAgo: 30 },
  { student: "高小雨", classIdx: 0, daysAgo: 2 }, // 新学生标记
  { student: "唐小雅", classIdx: 4, daysAgo: 35 },
  { student: "唐小雅", classIdx: 6, daysAgo: 30 },
  { student: "曹小睿", classIdx: 5, daysAgo: 22 },
  { student: "曹小睿", classIdx: 7, daysAgo: 18 },
  { student: "丁小翼", classIdx: 1, daysAgo: 14 },
  { student: "丁小翼", classIdx: 5, daysAgo: 12 },
  { student: "郭小甜", classIdx: 3, daysAgo: 18 },
  { student: "郭小甜", classIdx: 4, daysAgo: 15 },
  { student: "萧小琳", classIdx: 6, daysAgo: 26 },
];

const FEEDBACK: Record<string, { strength: string; next: string }> = {
  数学: { strength: "计算准确率明显提升", next: "下节巩固几何证明" },
  英语: { strength: "口语表达更自信", next: "继续积累阅读词汇" },
  科学: { strength: "实验步骤记录规范", next: "预习下一单元概念" },
  中文: { strength: "作文结构清晰", next: "加强古诗文背诵" },
  物理: { strength: "公式运用熟练", next: "练习综合应用题" },
};

async function main() {
  // 清空（按依赖顺序）
  await prisma.lessonFeedback.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.creditTransaction.deleteMany();
  await prisma.followUp.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.classEnrollment.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.student.deleteMany();
  await prisma.class.deleteMany();
  await prisma.user.deleteMany();

  const pwd = await bcrypt.hash("password123", 10);

  const admins = await Promise.all(
    [
      { name: "王丽", email: "wangli@austin.edu" },
      { name: "李强", email: "liqiang@austin.edu" },
      { name: "张敏", email: "zhangmin@austin.edu" },
      { name: "陈静", email: "chenjing@austin.edu" },
    ].map((u) => prisma.user.create({ data: { ...u, role: Role.ADMIN, passwordHash: pwd } }))
  );

  const teachers = await Promise.all(
    [
      { name: "王老师", email: "wang.teacher@austin.edu" },
      { name: "李老师", email: "li.teacher@austin.edu" },
      { name: "张老师", email: "zhang.teacher@austin.edu" },
      { name: "陈老师", email: "chen.teacher@austin.edu" },
    ].map((u) => prisma.user.create({ data: { ...u, role: Role.TEACHER, passwordHash: pwd } }))
  );

  // ── 学生 ──
  const studentByName: Record<string, { id: string; adminId: string }> = {};
  for (const s of STUDENTS) {
    const created = await prisma.student.create({
      data: {
        name: s.name,
        nickname: s.nickname,
        level: s.level,
        status: s.status,
        note: s.note,
        adminId: admins[s.adminIdx].id,
        guardianName: `${s.name.slice(0, 1)}家长`,
        guardianPhone: `04${String(90000000 + s.daysAgo * 137).slice(0, 8)}`,
        createdAt: new Date(Date.now() - s.daysAgo * DAY_MS),
      },
    });
    studentByName[s.name] = { id: created.id, adminId: created.adminId };
  }

  // ── 班级 ──
  const classes = [];
  for (const c of CLASSES) {
    const cls = await prisma.class.create({
      data: {
        name: c.name,
        subject: c.subject,
        teacherId: teachers[c.teacherIdx].id,
        dayOfWeek: c.dayOfWeek,
        startTime: c.start,
        endTime: c.end,
        capacity: c.capacity,
      },
    });
    classes.push(cls);
  }

  // ── 排班 ──
  for (const m of MEMBERSHIPS) {
    const st = studentByName[m.student];
    if (!st) continue;
    await prisma.classEnrollment.create({
      data: {
        classId: classes[m.classIdx].id,
        studentId: st.id,
        enrolledAt: new Date(Date.now() - m.daysAgo * DAY_MS),
      },
    });
  }

  // ── 报名（课时账户）+ 购买流水 ──
  const enrolled = STUDENTS.filter((s) => s.status === "ENROLLED");
  for (const s of enrolled) {
    const st = studentByName[s.name];
    const pack = s.pack ?? 20;
    const e = await prisma.enrollment.create({
      data: {
        studentId: st.id,
        creditsTotal: pack,
        creditsRemaining: pack,
        note: "2026 学年秋季报名",
        purchasedAt: new Date(Date.now() - (s.daysAgo - 2) * DAY_MS),
      },
    });
    await prisma.creditTransaction.create({
      data: {
        studentId: st.id,
        enrollmentId: e.id,
        type: "PURCHASE",
        amount: pack,
        balanceAfter: pack,
        note: "2026 学年秋季报名",
        createdAt: new Date(Date.now() - (s.daysAgo - 2) * DAY_MS),
      },
    });
    // 续费（林小静：展示同一学生多次购买）
    if (s.renewal) {
      const r = await prisma.enrollment.create({
        data: {
          studentId: st.id,
          creditsTotal: s.renewal,
          creditsRemaining: s.renewal,
          note: "续费",
          purchasedAt: new Date(Date.now() - 3 * DAY_MS),
        },
      });
      await prisma.creditTransaction.create({
        data: {
          studentId: st.id,
          enrollmentId: r.id,
          type: "PURCHASE",
          amount: s.renewal,
          balanceAfter: s.renewal,
          note: "续费",
          createdAt: new Date(Date.now() - 3 * DAY_MS),
        },
      });
    }
  }

  // ── 生成 lesson 实例：过去 30 天 + 未来 14 天（命中 dayOfWeek）──
  const PAST_DAYS = 30;
  const FUTURE_DAYS = 14;
  const today = melbourneToday();

  // lessonByClassDate[classIdx][date] = lessonId
  const lessonIdByKey: Record<string, string> = {};
  for (let ci = 0; ci < classes.length; ci++) {
    for (let offset = -PAST_DAYS; offset <= FUTURE_DAYS; offset++) {
      const date = melbourneDate(offset);
      if (dowOfDate(date) !== classes[ci].dayOfWeek) continue;
      const lesson = await prisma.lesson.create({ data: { classId: classes[ci].id, date } });
      lessonIdByKey[`${ci}|${date}`] = lesson.id;
    }
  }

  // ── 历史出勤 + 扣课时 + 反馈 ──
  // presentQuota：每个学生应出勤（扣课）的次数，与报名余额对账。
  const presentQuota: Record<string, number> = {};
  for (const s of enrolled) presentQuota[s.name] = s.historyPresent ?? 0;

  const presentDone: Record<string, number> = {};
  for (const s of enrolled) presentDone[s.name] = 0;

  const NON_PRESENT = ["ABSENT", "LATE", "EXCUSED"] as const;
  const rng = seeded(20261013);

  for (let ci = 0; ci < classes.length; ci++) {
    const members = MEMBERSHIPS.filter((m) => m.classIdx === ci);
    for (let offset = -PAST_DAYS; offset <= -1; offset++) {
      const date = melbourneDate(offset);
      if (date >= today) continue;
      if (dowOfDate(date) !== classes[ci].dayOfWeek) continue;
      const lessonId = lessonIdByKey[`${ci}|${date}`];
      if (!lessonId) continue;

      for (const m of members) {
        const st = studentByName[m.student];
        const quota = presentQuota[m.student] ?? 0;
        const done = presentDone[m.student] ?? 0;
        const isEnrolled = enrolled.some((s) => s.name === m.student);

        let status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
        if (isEnrolled && done < quota) {
          status = "PRESENT";
        } else {
          // 非出勤：确定性轮换（不扣课时）
          status = NON_PRESENT[Math.floor(rng() * NON_PRESENT.length)];
        }

        const creditsDeducted = status === "PRESENT" ? 1 : 0;
        await prisma.attendance.create({
          data: {
            lessonId,
            studentId: st.id,
            status,
            creditsDeducted,
            recordedById: classes[ci].teacherId,
            recordedAt: new Date(Date.now() - Math.abs(offset) * DAY_MS + 20 * 60 * 1000),
          },
        });

        if (status === "PRESENT") {
          presentDone[m.student] = done + 1;
          // 真实扣减：FIFO 扣最早到期的 ACTIVE 报名
          const enrollment = await prisma.enrollment.findFirst({
            where: { studentId: st.id, status: "ACTIVE", creditsRemaining: { gt: 0 } },
            orderBy: { purchasedAt: "asc" },
          });
          if (enrollment) {
            await prisma.enrollment.update({
              where: { id: enrollment.id },
              data: { creditsRemaining: { decrement: 1 } },
            });
            await prisma.enrollment.updateMany({
              where: { id: enrollment.id, creditsRemaining: 0, status: "ACTIVE" },
              data: { status: "EXHAUSTED" },
            });
            const after = await prisma.enrollment.findUnique({ where: { id: enrollment.id } });
            await prisma.creditTransaction.create({
              data: {
                studentId: st.id,
                enrollmentId: enrollment.id,
                lessonId,
                type: "DEDUCT",
                amount: -1,
                balanceAfter: after!.creditsRemaining,
                createdAt: new Date(Date.now() - Math.abs(offset) * DAY_MS + 30 * 60 * 1000),
              },
            });
            // 约半数出勤生成课堂反馈
            if ((done + 1) % 2 === 0) {
              const fb = FEEDBACK[classes[ci].subject] ?? { strength: "表现稳定", next: "继续巩固" };
              await prisma.lessonFeedback.create({
                data: {
                  lessonId,
                  studentId: st.id,
                  summary: `课堂表现积极，${fb.strength}。`,
                  strengths: fb.strength,
                  nextSteps: fb.next,
                  generatedBy: "MANUAL",
                },
              });
            }
          }
        }
      }
    }
  }

  // ── 跟进记录（切片②演示）──
  const followUps: { student: string; type: FollowUpType; content: string; next: string | null }[] = [
    { student: "陈小美", type: "TRIAL", content: "试听反馈良好，家长考虑报名，已约今天回访", next: today },
    { student: "王小刚", type: "CALL", content: "剩余 1 课时，电话提醒家长续费", next: today },
    { student: "赵小宇", type: "WECHAT", content: "已发试听报告，明天跟进报名意向", next: melbourneDate(1) },
    { student: "孙小涵", type: "CALL", content: "官网留资，电话未接通，明天再试", next: melbourneDate(1) },
    { student: "冯子墨", type: "TRIAL", content: "已预约本周六试听，需提前确认时间", next: melbourneDate(3) },
  ];
  for (const f of followUps) {
    const st = studentByName[f.student];
    if (!st) continue;
    await prisma.followUp.create({
      data: {
        studentId: st.id,
        adminId: st.adminId,
        type: f.type,
        content: f.content,
        nextFollowUpAt: f.next ? new Date(`${f.next}T00:00:00Z`) : null,
      },
    });
  }

  console.log("Seed 完成 ✅");
  console.log(`  今天(Melbourne): ${today}`);
  console.log(`  学生 ${STUDENTS.length} 人 · 班级 ${CLASSES.length} 个 · 历史+未来课实例已生成`);
  console.log("  演示账号（密码统一 password123）:");
  console.log("    课程顾问: wangli@austin.edu  (王丽)");
  console.log("    老师:     wang.teacher@austin.edu  (王老师)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
