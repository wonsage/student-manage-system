import "dotenv/config";
import { PrismaClient, Role, StudentStatus, FollowUpType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { melbourneDayOfWeek, melbourneToday, melbourneDate } from "../src/time";

const prisma = new PrismaClient();

function dateStr(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  // 用 Melbourne 本地日期
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function main() {
  // 清空（按依赖顺序：先删引用新表的流水/跟进，再删主表）
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

  // 用户：4 admin + 4 teacher
  const admins = await Promise.all(
    [
      { name: "王丽", email: "wangli@austin.edu" },
      { name: "李强", email: "liqiang@austin.edu" },
      { name: "张敏", email: "zhangmin@austin.edu" },
      { name: "陈静", email: "chenjing@austin.edu" },
    ].map((u) =>
      prisma.user.create({
        data: { ...u, role: Role.ADMIN, passwordHash: pwd },
      })
    )
  );

  const teachers = await Promise.all(
    [
      { name: "王老师", email: "wang.teacher@austin.edu" },
      { name: "李老师", email: "li.teacher@austin.edu" },
      { name: "张老师", email: "zhang.teacher@austin.edu" },
      { name: "陈老师", email: "chen.teacher@austin.edu" },
    ].map((u) =>
      prisma.user.create({
        data: { ...u, role: Role.TEACHER, passwordHash: pwd },
      })
    )
  );

  // 学生：分布在 4 个 admin 名下，覆盖不同状态
  const studentsSeed: {
    name: string;
    adminIdx: number;
    status: StudentStatus;
    level: string;
  }[] = [
    // 王丽名下（admin 0）—— 演示主角，登录这个账号
    { name: "张小明", adminIdx: 0, status: StudentStatus.ENROLLED, level: "Year 8" },
    { name: "李小红", adminIdx: 0, status: StudentStatus.ENROLLED, level: "Year 8" },
    { name: "王小刚", adminIdx: 0, status: StudentStatus.ENROLLED, level: "Year 9" },
    { name: "陈小美", adminIdx: 0, status: StudentStatus.TRIAL_DONE, level: "Year 7" },
    { name: "赵小宇", adminIdx: 0, status: StudentStatus.TRIAL_DONE, level: "Year 8" },
    { name: "孙小涵", adminIdx: 0, status: StudentStatus.LEAD, level: "Year 6" },
    { name: "周小杰", adminIdx: 0, status: StudentStatus.ENROLLED, level: "Year 9" },
    { name: "吴小琪", adminIdx: 0, status: StudentStatus.CHURNED, level: "Year 8" },
    // 李强名下（admin 1）
    { name: "郑小峰", adminIdx: 1, status: StudentStatus.ENROLLED, level: "Year 10" },
    { name: "冯小燕", adminIdx: 1, status: StudentStatus.TRIAL_DONE, level: "Year 8" },
    { name: "许小阳", adminIdx: 1, status: StudentStatus.ENROLLED, level: "Year 7" },
    // 张敏名下（admin 2）
    { name: "林小静", adminIdx: 2, status: StudentStatus.ENROLLED, level: "Year 9" },
    { name: "何小波", adminIdx: 2, status: StudentStatus.LEAD, level: "Year 6" },
    // 陈静名下（admin 3）
    { name: "高小雨", adminIdx: 3, status: StudentStatus.ENROLLED, level: "Year 8" },
    { name: "罗小凡", adminIdx: 3, status: StudentStatus.TRIAL_DONE, level: "Year 7" },
  ];

  const students = [];
  for (const s of studentsSeed) {
    const created = await prisma.student.create({
      data: {
        name: s.name,
        level: s.level,
        status: s.status,
        adminId: admins[s.adminIdx].id,
        guardianName: `${s.name.slice(0, 1)}家长`,
        guardianPhone: `04${String(Math.floor(10000000 + Math.random() * 89999999))}`,
      },
    });
    students.push(created);
  }

  // 报名（课时账户）：给 ENROLLED 学生建报名记录
  const creditsByStudent: Record<string, number> = {};
  const enrolled = students.filter((s) => s.status === StudentStatus.ENROLLED);
  for (let i = 0; i < enrolled.length; i++) {
    const s = enrolled[i];
    // 制造一个"快用完课时"（1 课时）和一个"已用完"（0 课时）的极端案例
    let credits = 20 - i * 2;
    if (i === 2) credits = 1; // 王小刚：快用完
    if (i === 3) credits = 0; // 周小杰：已用完（EXHAUSTED，用于演示扣课拦截）
    const enrollment = await prisma.enrollment.create({
      data: {
        studentId: s.id,
        creditsTotal: 20,
        creditsRemaining: credits,
        status: credits === 0 ? "EXHAUSTED" : "ACTIVE",
        note: "2026 学年秋季报名",
      },
    });
    // 课时流水（PURCHASE）
    await prisma.creditTransaction.create({
      data: {
        studentId: s.id,
        enrollmentId: enrollment.id,
        type: "PURCHASE",
        amount: 20,
        balanceAfter: credits,
        note: "2026 学年秋季报名",
      },
    });
    creditsByStudent[s.id] = credits;
  }
  // 林小静 续费一条，展示"同一学生多次购买"
  const lin = enrolled[6];
  if (lin) {
    const renewal = await prisma.enrollment.create({
      data: {
        studentId: lin.id,
        creditsTotal: 12,
        creditsRemaining: 12,
        note: "续费",
      },
    });
    await prisma.creditTransaction.create({
      data: {
        studentId: lin.id,
        enrollmentId: renewal.id,
        type: "PURCHASE",
        amount: 12,
        balanceAfter: 12,
        note: "续费",
      },
    });
  }

  const todayDow = melbourneDayOfWeek();
  const today = melbourneToday();

  // 班级：2 个班今天开课，其余错开
  const classesSeed = [
    { name: "数学 A 班", subject: "数学", teacher: teachers[0], dow: todayDow, start: "15:30", end: "17:00", capacity: 10 },
    { name: "数学 B 班", subject: "数学", teacher: teachers[0], dow: todayDow, start: "17:00", end: "18:30", capacity: 8 },
    { name: "英语 A 班", subject: "英语", teacher: teachers[1], dow: ((todayDow + 1) % 7) + 1, start: "16:00", end: "17:30", capacity: 10 },
    { name: "科学 A 班", subject: "科学", teacher: teachers[2], dow: ((todayDow + 2) % 7) + 1, start: "18:00", end: "19:30", capacity: 12 },
  ];

  const classes = [];
  for (const c of classesSeed) {
    const cls = await prisma.class.create({
      data: {
        name: c.name,
        subject: c.subject,
        teacherId: c.teacher.id,
        dayOfWeek: c.dow,
        startTime: c.start,
        endTime: c.end,
        capacity: c.capacity,
      },
    });
    classes.push(cls);
  }

  // 排班：把若干 ENROLLED 学生加进班级（含"新学生"标记的差异化 enrolledAt）
  const membershipPlan: { classIdx: number; studentName: string; daysAgo: number }[] = [
    { classIdx: 0, studentName: "张小明", daysAgo: 40 },
    { classIdx: 0, studentName: "李小红", daysAgo: 40 },
    { classIdx: 0, studentName: "王小刚", daysAgo: 3 }, // 新学生
    { classIdx: 0, studentName: "周小杰", daysAgo: 60 },
    { classIdx: 0, studentName: "郑小峰", daysAgo: 30 },
    { classIdx: 1, studentName: "林小静", daysAgo: 20 },
    { classIdx: 1, studentName: "高小雨", daysAgo: 2 }, // 新学生
    { classIdx: 2, studentName: "张小明", daysAgo: 40 },
    { classIdx: 3, studentName: "李小红", daysAgo: 40 },
  ];

  for (const p of membershipPlan) {
    const student = students.find((s) => s.name === p.studentName);
    if (!student) continue;
    const cls = classes[p.classIdx];
    await prisma.classEnrollment.create({
      data: {
        classId: cls.id,
        studentId: student.id,
        enrolledAt: new Date(Date.now() - p.daysAgo * 24 * 60 * 60 * 1000),
      },
    });
  }

  // 生成 lesson 实例：为每个班生成今天 + 未来 7 天中命中该班 dayOfWeek 的课
  for (const cls of classes) {
    for (let offset = 0; offset <= 7; offset++) {
      const date = dateStr(offset);
      const d = new Date(date + "T00:00:00Z");
      const dow = ((d.getUTCDay() + 6) % 7) + 1; // 转 ISO-8601 1=Mon..7=Sun
      if (dow !== cls.dayOfWeek) continue;
      await prisma.lesson.create({
        data: { classId: cls.id, date },
      });
    }
  }

  // 跟进记录（切片②演示）：给「待跟进试听」和「快用完课时」的学生造几条跟进
  const followUpPlan: {
    studentName: string;
    type: FollowUpType;
    content: string;
    next: string | null;
  }[] = [
    { studentName: "陈小美", type: FollowUpType.TRIAL, content: "试听反馈良好，家长考虑报名，已约今天回访", next: melbourneToday() },
    { studentName: "王小刚", type: FollowUpType.CALL, content: "剩余 1 课时，电话提醒家长续费", next: melbourneToday() },
    { studentName: "赵小宇", type: FollowUpType.WECHAT, content: "已发试听报告，明天跟进报名意向", next: melbourneDate(1) },
  ];
  for (const f of followUpPlan) {
    const st = students.find((s) => s.name === f.studentName);
    if (!st) continue;
    await prisma.followUp.create({
      data: {
        studentId: st.id,
        adminId: admins[0].id, // 王丽名下
        type: f.type,
        content: f.content,
        nextFollowUpAt: f.next ? new Date(`${f.next}T00:00:00Z`) : null,
      },
    });
  }

  console.log("Seed 完成 ✅");
  console.log(`  今天(Melbourne): ${today} (周${todayDow})`);
  console.log("  演示账号（密码统一 password123）:");
  console.log("    课程顾问: wangli@austin.edu  (王丽，名下学生最多)");
  console.log("    老师:     wang.teacher@austin.edu  (王老师，今天有课)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
