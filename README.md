# 学生管理系统 · Austin Education 技术作业

> **线上体验（已部署）**：<https://student-manage-system-demo.vercel.app/>

一个面向教育机构的**学生全生命周期管理**系统，包含三个垂直切片：

1. **报名 → 排进班级 → 上课记出勤并扣课时**（核心）
2. **学生跟进 / 待办**（驱动顾问每日行动）
3. **课时流水账**（课时每笔变动可追溯）

界面亮点：**Mac 日历式排课视图**（日/周/月切换、课程块按科目配色）、**图表化工作台**（报名趋势 / 课时消耗 / 状态分布 / 出勤率）、**角色化双工作台**（顾问驾驶舱 / 老师教学日程）、学生详情"客户 360"。演示数据覆盖过去 30 天 + 未来 14 天（历史出勤、反馈、流水俱全），任何一天打开都有数据。

- 设计文档：[`DESIGN.md`](./DESIGN.md)（业务理解、数据模型、业务规则、页面草图、切片理由）
- 技术栈：前端 React + TypeScript + Vite；后端 Express + TypeScript + Prisma + PostgreSQL
- 时区：统一 `Australia/Melbourne`

---

## 线上体验（已部署）

| 项 | 地址 |
|---|---|
| 前端 | <https://student-manage-system-demo.vercel.app/> |
| 后端 API | <https://student-manage-system-nine.vercel.app>（`/api/health` 返回 200） |

**演示账号**（密码统一 `password123`）：课程顾问 `wangli@austin.edu`（王丽，名下学生最多）、老师 `wang.teacher@austin.edu`（今天有课）、其他顾问 `liqiang@austin.edu`（演示"只能改自己名下学生"）。

---

## 目录结构

```
.
├── DESIGN.md / README.md / DEMO.md / DEPLOY.md
├── server/                  # 后端（Express + Prisma + PostgreSQL）
│   ├── prisma/schema.prisma        # 数据模型（ER 的落点）
│   ├── prisma/migrations/          # 含 CHECK 约束的迁移
│   ├── prisma/seed.ts              # 演示数据（幂等：先清空再重建）
│   └── src/                        # 入口/规则/LLM/认证/路由
└── web/                     # 前端（Vite + React）
    └── src/pages/                   # 登录/工作台/学生/班级/课堂
```

---

## 本地运行

需要 Node.js 18+ 与 Docker。完整说明见 [`DEPLOY.md`](./DEPLOY.md)。

```bash
docker compose up -d db                    # 根目录，起 Postgres（5433）
cd server
cp .env.example .env && npm install        # 首次运行
npx prisma migrate deploy && npm run db:seed
npm run dev                                # 后端 http://localhost:4000

cd ../web && npm install && npm run dev    # 前端 http://localhost:5173（被占用会自动换端口）
```

---

## 核心业务规则（全部在服务端强制）

绕过前端直接调接口也会被拦截：

| 规则 | 执行位置 |
|---|---|
| 学生不能排进时间重叠的班 | 服务端 `rules.ts` |
| 课时余额不为负，扣到 0 自动 EXHAUSTED | 事务内条件 `UPDATE`（`creditsRemaining > 0`）+ 数据库 `CHECK` |
| 只有 ENROLLED 学生能排班 | 服务端 |
| 同一课同一学生只扣一次课时 | 数据库 `UNIQUE` + 扣课时与出勤同一事务 |
| 课时每笔变动都有流水，可与账户对账 | 事务内写 `CreditTransaction`（PURCHASE/DEDUCT） |
| admin 只能改自己名下学生（可读全部） | 中间件 `assertCanWriteStudent` |
| 班级容量 / 老师时间不重叠 | 服务端 |

**破坏测试**：给 0 课时学生（`周小杰`）记出勤、把学生排进时间冲突的班、用别的顾问账号改别人的学生，都会得到 4xx 拒绝。完整自动化脚本见 `server/scripts/e2e.mjs`（40 项断言，含跟进/流水回归）。

---

## LLM 的使用

放在**老师下课写课堂反馈**这个高频、费时、格式化的环节：

- 老师点「AI 生成反馈」，服务端用 OpenAI 兼容接口（`response_format: json_object`）生成草稿。
- 返回用 **zod 做结构化校验**，不符合 schema 直接丢弃。
- 任何失败（未配 key / 网络错误 / 校验不过）都**降级为手工填写**，系统照常工作。
- key 走环境变量 `LLM_API_KEY`（`server/.env`），**不提交仓库**。

配置：`server/.env` 填 `LLM_API_KEY`（默认 `https://api.openai.com/v1`，`LLM_BASE_URL`/`LLM_MODEL` 可换任意 OpenAI 兼容服务）。不填也能完整演示（降级）。

---

## AI 工具使用说明

本次开发使用了 AI 编程工具辅助：

- **用了 AI 的环节**：脚手架搭建、Prisma schema 与 TypeScript 样板、CSS 设计系统初稿、seed 数据铺写、端到端测试脚本。
- **AI 给过但没采纳的建议**：
  1. "学生表直接放 `credits` 字段" → 改成独立 `Enrollment` 表 + 多条记录，因为课时是"预付费账户"，需支持多次购买/退费/逐笔追溯。
  2. "班级和课合成一张表" → 拆成 `Class`（模板）+ `Lesson`（实例），否则"老师请假一周""补课"无法表达。
  3. "学生↔顾问用多对多" → 改成 `Student.adminId` 归属关系，保证跟进有唯一责任人。

---

## 部署与数据自动刷新

前后端分离，部署为两个 Vercel 项目 + 一个 Neon Postgres，完整步骤见 [`DEPLOY.md`](./DEPLOY.md)。

**线上演示数据如何保鲜**：seed 生成的"今日课程"是**相对执行日的绝对日期**，跨天后会过期；演示操作（报名/扣课时/改状态）也会污染数据。因此内置了 GitHub Actions 定时任务，**每天 Melbourne 早上自动重置 Neon 数据**（`.github/workflows/reset-demo.yml`），也可在 GitHub Actions 页面手动 "Run workflow" 立即重置。

- 前提：在 GitHub 仓库 **Settings → Secrets and variables → Actions** 配一个 `NEON_DATABASE_URL`（Neon **直连串**，去掉 `&channel_binding=require`，见 DEPLOY.md）。
- 手动兜底：本地 `./scripts/reset-demo.sh`（`server/.env` 指向 Neon 直连串时直接重置线上）。

---

## 时间处理

系统业务时间统一用 `Australia/Melbourne`（含夏令时），通过 `Intl.DateTimeFormat` 的 `timeZone` 计算"今天"，无多时区切换逻辑。班级排期存 `dayOfWeek` + `HH:MM`，不存绝对时间戳。
