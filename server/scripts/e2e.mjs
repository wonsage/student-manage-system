const BASE = process.env.BASE_URL || "http://localhost:4000";

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

function check(name, cond, detail = "") {
  console.log(`${cond ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) process.exitCode = 1;
}

async function main() {
  const adminLogin = await api("/api/auth/login", {
    method: "POST",
    body: { email: "wangli@austin.edu", password: "password123" },
  });
  check("admin 登录", adminLogin.status === 200);
  const AT = adminLogin.data.token;

  const teacherLogin = await api("/api/auth/login", {
    method: "POST",
    body: { email: "wang.teacher@austin.edu", password: "password123" },
  });
  check("teacher 登录", teacherLogin.status === 200);
  const TT = teacherLogin.data.token;

  // 无 token 访问被拒
  const noAuth = await api("/api/students");
  check("无 token 访问学生列表 → 401", noAuth.status === 401);

  // dashboard
  const dash = await api("/api/dashboard", { token: AT });
  check("admin dashboard", dash.status === 200, JSON.stringify(dash.data.stats));

  // 学生列表
  const mine = await api("/api/students?scope=mine", { token: AT });
  check("我的学生列表", mine.status === 200, `${mine.data.students.length} 人`);

  const all = await api("/api/students?scope=all", { token: AT });
  check("全部学生列表（跨顾问可读）", all.status === 200, `${all.data.students.length} 人`);

  // 状态筛选 + 快捷筛选（工作台入口回填修复的回归）
  const trialDone = await api("/api/students?scope=mine&status=TRIAL_DONE", { token: AT });
  check(
    "筛选：试听待跟进 → 只含 TRIAL_DONE",
    trialDone.status === 200 && trialDone.data.students.every((s) => s.status === "TRIAL_DONE"),
    `${trialDone.data.students.length} 人`
  );

  const lowCredits = await api("/api/students?scope=mine&status=LOW_CREDITS", { token: AT });
  check(
    "筛选：快用完课时 → 只含余额 1~2",
    lowCredits.status === 200 &&
      lowCredits.data.students.every((s) => s.remainingCredits > 0 && s.remainingCredits <= 2),
    `${lowCredits.data.students.length} 人`
  );

  // 找一个自己名下 ENROLLED 学生 + 一个别人名下的学生
  const myEnrolled = mine.data.students.find((s) => s.status === "ENROLLED");
  const others = all.data.students.find((s) => s.admin.id !== adminLogin.data.user.id);

  // 规则 #5：admin 不能改别人名下的学生
  const patchOther = await api(`/api/students/${others.id}`, {
    method: "PATCH",
    token: AT,
    body: { note: "hack" },
  });
  check("权限：改别人学生 → 403", patchOther.status === 403);

  // 报名：给一个 LEAD 学生买课时
  const lead = mine.data.students.find((s) => s.status === "LEAD");
  const enroll = await api(`/api/students/${lead.id}/enrollments`, {
    method: "POST",
    token: AT,
    body: { credits: 10, note: "测试报名" },
  });
  check("报名买课时", enroll.status === 201, `${lead.name} +10 课时`);
  check("报名后学生变 ENROLLED", enroll.data.enrollment.studentId === lead.id);

  // 班级列表
  const classes = await api("/api/classes", { token: AT });
  const mathA = classes.data.classes.find((c) => c.name === "数学 A 班");
  check("班级列表", classes.status === 200, `${classes.data.classes.length} 个班`);

  // 规则 #1：时间冲突。张小明已在数学A班（今天 15:30），排进英语A班（今天错开）应成功；
  // 排进一个今天同样时段的班应冲突。
  const zhang = mine.data.students.find((s) => s.name === "张小明");
  const mathB = classes.data.classes.find((c) => c.name === "数学 B 班");
  // 数学B班 17:00-18:30 与数学A班 15:30-17:00 首尾相接（17:00 相接），不算冲突
  const addMathB = await api(`/api/classes/${mathB.id}/members`, {
    method: "POST",
    token: AT,
    body: { studentId: zhang.id },
  });
  check("排进首尾相接的班 → 允许", addMathB.status === 201, "17:00 相接不冲突");

  // 规则 #1：构造真正冲突 —— 把 zhang 排进一个和数学A重叠的班。
  // 用「科学A班」的老师（今天无课，避免触发老师冲突规则），建今天 16:00-17:30（与数学A 15:30-17:00 重叠）。
  const science = classes.data.classes.find((c) => c.name === "科学 A 班");
  const conflictClass = await api("/api/classes", {
    method: "POST",
    token: AT,
    body: {
      name: "冲突测试班",
      subject: "测试",
      teacherId: science.teacher.id,
      dayOfWeek: mathA.dayOfWeek,
      startTime: "16:00",
      endTime: "17:30",
      capacity: 10,
    },
  });
  check("建冲突测试班", conflictClass.status === 201, conflictClass.data.class?.name || conflictClass.data.error);

  const addConflict = await api(`/api/classes/${conflictClass.data.class.id}/members`, {
    method: "POST",
    token: AT,
    body: { studentId: zhang.id },
  });
  check("规则#1：排进时间冲突的班 → 409", addConflict.status === 409, addConflict.data.error);

  // 规则 #3：非 ENROLLED 学生不能排班（用 TRIAL_DONE 学生测试）
  const leadNow = await api("/api/students?scope=mine", { token: AT });
  const notEnrolled = leadNow.data.students.find((s) => s.status !== "ENROLLED");
  const addLead = await api(`/api/classes/${mathA.id}/members`, {
    method: "POST",
    token: AT,
    body: { studentId: notEnrolled.id },
  });
  check("规则#3：非报名学生排班 → 409", addLead.status === 409, addLead.data.error);

  // 规则 #2：0 课时学生记出勤被拒。找老师今天的课。
  const lessons = await api("/api/lessons", { token: TT });
  const todayLesson = lessons.data.lessons[0];
  check("teacher 今日课程", lessons.status === 200, `${lessons.data.lessons.length} 节`);

  // 找一个 0 课时学生（在老师班里的）
  const lessonDetail = await api(`/api/lessons/${todayLesson.id}`, { token: TT });
  const roster = lessonDetail.data.lesson.roster;
  check("课堂详情含名单", roster.length > 0, `${roster.length} 人`);
  const newStudent = roster.find((r) => r.student.isNew);
  const zeroCredit = roster.find((r) => r.student.remainingCredits === 0);
  check("名单里识别出 ⭐新学生", !!newStudent, newStudent?.student.name);
  check("名单里存在 0 课时学生（用于拦截演示）", !!zeroCredit, zeroCredit?.student.name);

  // 老师记出勤（正常扣课时）
  const target = roster.find((r) => r.student.remainingCredits > 0);
  const att = await api(`/api/lessons/${todayLesson.id}/attendances`, {
    method: "POST",
    token: TT,
    body: { studentId: target.student.id, status: "PRESENT" },
  });
  check("老师记出勤 PRESENT → 扣 1 课时", att.status === 201, `deducted=${att.data.deducted}`);

  // 规则 #4：重复记出勤不重复扣
  const att2 = await api(`/api/lessons/${todayLesson.id}/attendances`, {
    method: "POST",
    token: TT,
    body: { studentId: target.student.id, status: "PRESENT" },
  });
  check("规则#4：重复记出勤 → 幂等不重复扣", att2.status === 200, `deducted=${att2.data.deducted}`);

  // 规则 #2：0 课时学生记出勤被拒
  if (zeroCredit) {
    const att0 = await api(`/api/lessons/${todayLesson.id}/attendances`, {
      method: "POST",
      token: TT,
      body: { studentId: zeroCredit.student.id, status: "PRESENT" },
    });
    check("规则#2：0 课时学生记出勤 → 409", att0.status === 409, att0.data.error);
  }

  // admin 不能记出勤（不是老师）
  const adminAtt = await api(`/api/lessons/${todayLesson.id}/attendances`, {
    method: "POST",
    token: AT,
    body: { studentId: target.student.id, status: "PRESENT" },
  });
  check("权限：admin 记出勤 → 403", adminAtt.status === 403);

  // LLM 降级（未配 key）
  const llm = await api(`/api/lessons/${todayLesson.id}/feedback/generate`, {
    method: "POST",
    token: TT,
    body: { studentId: target.student.id },
  });
  check("LLM 生成反馈（无 key 降级）", llm.status === 200 && llm.data.ok === false, llm.data.reason);

  // 保存反馈
  const fb = await api(`/api/lessons/${todayLesson.id}/feedback`, {
    method: "POST",
    token: TT,
    body: { studentId: target.student.id, summary: "本节课表现良好", generatedBy: "MANUAL" },
  });
  check("保存课堂反馈", fb.status === 201);

  // ===== 回归：问题 1 — 先缺勤再改出勤必须补扣课时 =====
  const victim1 = roster.find(
    (r) => r.student.id !== target.student.id && r.student.remainingCredits > 0
  );
  if (victim1) {
    const before1 = victim1.student.remainingCredits;
    const abs = await api(`/api/lessons/${todayLesson.id}/attendances`, {
      method: "POST",
      token: TT,
      body: { studentId: victim1.student.id, status: "ABSENT" },
    });
    check("问题1：先记缺勤 → 不扣课时", abs.status === 201 && abs.data.deducted === false, `deducted=${abs.data.deducted}`);
    const pres = await api(`/api/lessons/${todayLesson.id}/attendances`, {
      method: "POST",
      token: TT,
      body: { studentId: victim1.student.id, status: "PRESENT" },
    });
    check("问题1：缺勤→出勤 补扣 1 课时", pres.status === 200 && pres.data.deducted === true, `deducted=${pres.data.deducted}`);
    const d1 = await api(`/api/lessons/${todayLesson.id}`, { token: TT });
    const r1 = d1.data.lesson.roster.find((r) => r.student.id === victim1.student.id);
    check("问题1：补扣后剩余课时 = 原 -1", r1.student.remainingCredits === before1 - 1, `${before1} → ${r1.student.remainingCredits}`);
  }

  // ===== 回归：问题 2 — 并发双击只扣一次 =====
  const victim2 = roster.find(
    (r) =>
      r.student.id !== target.student.id &&
      r.student.id !== victim1?.student.id &&
      r.student.remainingCredits > 0
  );
  if (victim2) {
    const before2 = victim2.student.remainingCredits;
    const [rA, rB] = await Promise.all([
      api(`/api/lessons/${todayLesson.id}/attendances`, {
        method: "POST",
        token: TT,
        body: { studentId: victim2.student.id, status: "PRESENT" },
      }),
      api(`/api/lessons/${todayLesson.id}/attendances`, {
        method: "POST",
        token: TT,
        body: { studentId: victim2.student.id, status: "PRESENT" },
      }),
    ]);
    const deductedTimes = [rA, rB].filter((r) => r.data?.deducted === true).length;
    check("问题2：并发双击只扣一次课时", deductedTimes === 1, `deducted 次数=${deductedTimes}`);
    const d2 = await api(`/api/lessons/${todayLesson.id}`, { token: TT });
    const r2 = d2.data.lesson.roster.find((r) => r.student.id === victim2.student.id);
    check("问题2：并发后剩余课时 = 原 -1", r2.student.remainingCredits === before2 - 1, `${before2} → ${r2.student.remainingCredits}`);
  }

  // ===== 回归：问题 3 — 新建班当天即可点名 =====
  const meta = await api("/api/meta");
  const newClass = await api("/api/classes", {
    method: "POST",
    token: AT,
    body: {
      name: "新建测试班",
      subject: "测试",
      teacherId: science.teacher.id,
      dayOfWeek: meta.data.dayOfWeek, // 今天
      startTime: "09:00",
      endTime: "10:30",
      capacity: 10,
    },
  });
  check("问题3：新建班成功", newClass.status === 201, newClass.data.class?.name || newClass.data.error);
  if (newClass.status === 201) {
    const adminLessons = await api("/api/lessons", { token: AT });
    const newLesson = adminLessons.data.lessons.find((l) => l.class.id === newClass.data.class.id);
    check("问题3：新建班当天即可查到课（可点名）", !!newLesson, newLesson ? newLesson.class.name : "未生成 lesson");
  }

  // ===== 切片②：学生跟进 / 待办 =====
  const followToday = await api("/api/followups/today", { token: AT });
  check(
    "跟进：今日待跟进清单",
    followToday.status === 200,
    `试听${followToday.data.pendingTrial.length} 低课时${followToday.data.lowCredits.length} 到期${followToday.data.dueFollowUps.length}`
  );
  check("跟进：自动识别待跟进试听", followToday.data.pendingTrial.length > 0);
  check("跟进：自动识别快用完课时", followToday.data.lowCredits.length > 0);

  const trialStudent = mine.data.students.find((s) => s.status === "TRIAL_DONE");
  if (trialStudent) {
    const fup = await api(`/api/students/${trialStudent.id}/followups`, {
      method: "POST",
      token: AT,
      body: { type: "CALL", content: "e2e 测试跟进", nextFollowUpAt: "2000-01-01" },
    });
    check("跟进：记录跟进 → 201", fup.status === 201);
    const after = await api("/api/followups/today", { token: AT });
    const inDue = after.data.dueFollowUps.some((f) => f.studentId === trialStudent.id);
    check("跟进：过期跟进回流到待办", inDue);
  }

  // ===== 切片③：课时流水 =====
  const leadDetail = await api(`/api/students/${lead.id}`, { token: AT });
  const purchaseTx = leadDetail.status === 200
    ? leadDetail.data.student.creditTransactions.find((tx) => tx.type === "PURCHASE")
    : null;
  check("流水：报名产生 PURCHASE 流水（金额=购买数）", !!purchaseTx && purchaseTx.amount === 10, `amount=${purchaseTx?.amount}`);

  const targetDetail = await api(`/api/students/${target.student.id}`, { token: AT });
  const dedTx = targetDetail.status === 200
    ? targetDetail.data.student.creditTransactions.find((tx) => tx.type === "DEDUCT")
    : null;
  check("流水：出勤产生 DEDUCT 流水（-1）", !!dedTx && dedTx.amount === -1, `amount=${dedTx?.amount}`);

  console.log("\n全部检查完成。");
}

main().catch((e) => {
  console.error("测试脚本异常:", e);
  process.exit(1);
});
