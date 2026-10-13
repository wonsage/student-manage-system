# Demo 演示脚本（面试 45 分钟版）

> 目标：用一条「报名 → 排课 → 上课扣课时」的垂直切片，讲清楚**业务理解、数据建模、以及"规则在服务端"**。
> **默认走线上 Vercel 版**（已部署、可随时点）；本地启动仅作断网/开发备选，见文末「附：本地启动」。

---

## 线上地址与账号（密码统一 `password123`）

| 项 | 值 |
|---|---|
| 前端 | <https://student-manage-system-iota.vercel.app/> |
| 后端 API | <https://student-manage-system-nine.vercel.app>（`/api/health` 返回 200） |
| 课程顾问 | `wangli@austin.edu`（名下学生最多，含各状态） |
| 老师 | `wang.teacher@austin.edu`（今天有课） |
| 其他顾问 | `liqiang@austin.edu`（演示"只能改自己名下学生"） |

---

## 0. 演示前准备（线上版，开演前 5 分钟）

1. **浏览器开无痕/隐私窗口**，避免旧 localStorage 残留 token 跳错页。
2. **重置线上数据**（Neon）。`server/.env` 的 `DATABASE_URL` 当前指向 Neon **直连串**，直接跑即可重置线上库：

   ```bash
   ./scripts/reset-demo.sh
   ```

   > 若你中途为本地开发把 `server/.env` 改回了 Docker 串，先改回 Neon 直连串再跑。
3. **预热**：先访问一次前端首页 + 后端 `/api/health`，避免 Vercel 免费档冷启动的几秒延迟。
4. **LLM key（可选）**：线上 Vercel 后端项目若未配 `LLM_API_KEY`，「AI 生成反馈」会**降级为手写**（功能正常）。想展示真实结构化输出，在 Vercel 后端项目 **Settings → Environment Variables** 加 `LLM_API_KEY` 后重新部署。

---

## 1. 顾问端（约 10 分钟）

### 1.1 登录 + 工作台
- 用 `wangli@austin.edu` 登录。
- **讲**：登录后第一屏是工作台，卡片对应"最关心"的数据口径（待跟进试听 / 快用完课时 / 我的学生 / 本周新报名）。
- **讲**：系统是**归属制**——每个顾问只看自己名下学生，这是权限模型的基础（`Student.adminId` 1:N）。

### 1.2 状态筛选（讲状态机）
- 点「**待跟进试听**」卡片 → 跳学生列表，状态下拉框自动落在「试听待跟进」。
- **讲**：状态机 `LEAD(咨询) → TRIAL_SCHEDULED(约试听) → TRIAL_DONE(试听待跟进) → ENROLLED(报名) → CHURNED(流失)`，共 **5 种**。
- 点「**快用完课时**」卡片 → 只剩「王小刚(1 课时)」。
- **讲**：**课时就是钱**——快用完要主动触达续费，这是把课时显式建模、而不是塞进学生一个字段的原因。

### 1.3 学生详情 + 报名（讲课时账户）
- 进「王小刚」详情 →「报名 / 续费」→ 买 10 课时。
- **讲**：课时不是学生的一个数字，而是 `Enrollment`（课时账户）表，**一次购买一条记录**，支持续费/退费/多次购买；剩余课时 = 各账户余额之和。

### 1.4 排进班级（讲 Class/Lesson 分离 + 规则拦截）
- 点「排进班级」→ 弹窗已自动**过滤/标记**：时间冲突标 ⚠、满员标「已满」、已加入标「已加入」。
- **讲**：`Class`（班级）= 每周固定模板（星期几 + 起止时间），`Lesson`（课）= 某天具体实例。分开才能表达"请假/补课/取消某一天"。
- 顺手演示破坏测试：给「张小明」排一个与他已有班时间重叠的班 → 服务端 409「排课冲突」（前端已预过滤，绕过前端也被拦）。

---

## 2. 老师端（约 8 分钟）

### 2.1 今日课程 + 名单
- 右上角退出，换 `wang.teacher@austin.edu` 登录 → 今日课程。
- 进「数学 A 班」→ 名单里能看到 **⭐ 新学生标记**、每个学生**剩余课时**。

### 2.2 点名记出勤（讲扣课时事务）
- 点「全部出勤」或单个学生「出勤」→ 该生课时 **-1**。
- **讲**：出勤即扣课时凭证，`Attendance.creditsDeducted` 记流水；扣减用**事务内条件 UPDATE**（`creditsRemaining > 0` 才扣）并自动置 `EXHAUSTED`——余额不为负、并发安全。

### 2.3 0 课时拦截（必做，最有说服力）
- 名单里找「周小杰」（0 课时）→ 点「出勤」→ 红色 toast「**课时不足**」。
- **讲**：这是**服务端强制**规则，不是前端按钮禁用。绕过界面直接调接口也返回 409。

### 2.4 AI 课堂反馈（讲 structured output + 降级）
- 点某学生的「生成 AI 反馈」→ 产出结构化「总结 / 优点 / 下一步」。
- **讲**：LLM 用 OpenAI 兼容接口 + `response_format: json_object`，返回后 **zod 做 schema 校验**；无 key 时**降级手写**、功能不崩——不是装饰性聊天框。
- 若没配 key，这一步降级，主动补一句"配了 key 就会在这里输出结构化 JSON"。

---

## 3. 破坏测试（"规则在服务端"，1-2 分钟）

> 面试官若质疑"是不是只是前端按钮禁用"，直接跑完整自动化脚本（26 项断言全过）：

```bash
# 线上（对已部署后端）
BASE_URL=https://student-manage-system-nine.vercel.app node server/scripts/e2e.mjs

# 本地
cd server && node scripts/e2e.mjs
```

覆盖的破坏用例（都在服务端拦截）：

| # | 用例 | 预期 |
|---|---|---|
| ① | 排进时间重叠的班 | 409 排课冲突 |
| ② | 给 0 课时学生记出勤 | 409 课时不足 |
| ③ | 用 `liqiang@austin.edu` 改王丽名下学生 | 403 越权 |
| ④ | 给 LEAD/试听学生排正式班 | 409 只有 ENROLLED 可排 |
| ⑤ | 重复记出勤 | 200 幂等不重复扣 |
| ⑥ | admin 记出勤（非老师） | 403 |

> ⚠️ e2e 会写数据（报名/排班/扣课时），跑完如需回到干净状态，再跑一次 `./scripts/reset-demo.sh`。

---

## 4. 高频追问应答（提前想清楚）

| 面试官可能问 | 一句话应答 |
|---|---|
| 为什么 Class 和 Lesson 拆两张表？ | 班级是"每周几点的模板"，课是"某一天的实际发生"，拆开才能表达请假/补课/取消。 |
| 课时为什么放 Enrollment 不放学生字段？ | 课时=钱，需要账户+流水，支持多次购买/退费/追踪每笔来源。 |
| 扣课时怎么保证并发安全？ | 事务内条件 UPDATE（`creditsRemaining > 0`），DB `CHECK(creditsRemaining >= 0)` 兜底；出勤表 `UNIQUE(lessonId, studentId)` 挡重复。 |
| 试听排课为什么没做？ | 试听是一次性销售动作、不扣课时，和正式课不同模型，属漏斗前端 CRM，第二版独立做更清晰（已写进 DESIGN.md）。 |
| 学生转顾问 / 老师请假 / 退费？ | 模型已留字段（`adminId` / `Lesson.status=CANCELLED` / `Enrollment.status=REFUNDED`），接口是砍掉的，讲清"为什么砍 + 怎么做"。 |

---

## 5. 演示避坑

- **每次演示前跑 `./scripts/reset-demo.sh`**，否则残留操作（改了状态、扣了课时）会串。
- **无痕窗口**登录，避免旧 token 跳错页。
- **冷启动**：Vercel 免费档首次访问有几秒延迟，提前点一遍预热。
- **时间相关数据动态生成**：seed 按"今天(Melbourne)"生成当天课，所以"今日课程"永远有内容。

---

## 附：本地启动（备选 / 离线开发）

线上不可用时，本地也能完整跑（需要 Node 18+ 与 Docker）：

```bash
# 0. 起 Postgres（根目录，端口 5433）
docker compose up -d db

# 1. 后端：先确认 server/.env 的 DATABASE_URL 指向 localhost Docker 串
#    （见 server/.env.example：postgresql://postgres:postgres@localhost:5433/student_manage）
cd server
cp .env.example .env          # 首次运行
npm install                   # 会自动 prisma generate
npx prisma migrate deploy
npm run db:seed
npm run dev                   # http://localhost:4000

# 2. 前端（新开终端）
cd ../web
npm install
npm run dev                   # http://localhost:5173（被占用会自动换端口）
```

- 本地跑所有 `node/npm/npx` 命令前加 `env -u NODE_OPTIONS`（本机 node 被 WorkBuddy shim 接管，否则报 `CODEBUDDY_BROKER_DENY`）。
- 本地破坏测试：`cd server && env -u NODE_OPTIONS node scripts/e2e.mjs`。
- 本地重置数据：`./scripts/reset-demo.sh`（此时 `server/.env` 指向本地 Docker）。
