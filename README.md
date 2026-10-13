# 学生管理系统 · Austin Education 技术作业

一个面向教育机构的**学生全生命周期管理**系统的最小可运行切片：**报名 → 排进班级 → 上课记出勤并扣课时**。

- 设计文档：[`DESIGN.md`](./DESIGN.md)（业务理解、数据模型、业务规则、页面草图、切片理由）
- 前端：React + TypeScript + Vite
- 后端：Express + TypeScript + Prisma + SQLite
- 时区：统一 `Australia/Melbourne`

---

## 目录结构

```
.
├── DESIGN.md            # 设计文档（Part A）
├── README.md            # 本文档
├── server/              # 后端（Express + Prisma + SQLite）
│   ├── prisma/
│   │   ├── schema.prisma        # 数据模型（ER 的落点）
│   │   ├── migrations/          # 含 CHECK 约束的迁移
│   │   └── seed.ts              # 演示数据
│   └── src/
│       ├── index.ts             # 入口 + dashboard/teachers 路由
│       ├── rules.ts             # 业务规则（冲突/课时/容量…）
│       ├── llm.ts               # LLM structured output + 降级
│       ├── auth.ts / middleware.ts  # 认证与权限
│       └── routes/              # students/classes/lessons/enrollments/auth
└── web/                 # 前端（Vite + React）
    └── src/
        ├── api.ts               # API 客户端 + 401 处理
        ├── auth.tsx             # 登录态
        └── pages/               # 登录/工作台/学生/班级/课堂
```

---

## 如何运行

> 需要 Node.js 18+。数据库用 SQLite，零外部依赖，本地即可跑。

```bash
# 1. 后端
cd server
cp .env.example .env          # 首次运行
npm install
npx prisma migrate deploy     # 建表（含 CHECK 约束）
npx prisma generate
npm run db:seed               # 写入演示数据
npm run dev                   # 启动 http://localhost:4000

# 2. 前端（新开一个终端）
cd web
npm install
npm run dev                   # 启动 http://localhost:5173（被占用会自动换端口）
```

打开前端地址即可登录。

### 演示账号（密码统一 `password123`）

| 角色 | 邮箱 | 说明 |
|------|------|------|
| 课程顾问 | `wangli@austin.edu` | 王丽，名下学生最多，演示报名/排课/权限 |
| 老师 | `wang.teacher@austin.edu` | 王老师，今天有课，演示点名扣课时/反馈 |
| 其他顾问 | `liqiang@austin.edu` 等 | 用于演示"只能改自己名下学生" |

---

## 核心业务规则（全部在服务端强制）

绕过前端直接调接口也会被拦截：

| 规则 | 执行位置 |
|------|---------|
| 学生不能排进时间重叠的班 | 服务端 `rules.ts` |
| 课时余额不为负，扣到 0 自动 EXHAUSTED | 事务内条件 `UPDATE` + 数据库 `CHECK` |
| 只有 ENROLLED 学生能排班 | 服务端 |
| 同一课同一学生只扣一次课时 | 数据库 `UNIQUE` + 幂等 |
| admin 只能改自己名下学生（可读全部） | 中间件 `assertCanWriteStudent` |
| 班级容量 / 老师时间不重叠 | 服务端 |

**破坏测试提示**：可尝试用 0 课时学生记出勤（`周小杰`）、把学生排进时间冲突的班、用别的顾问账号改别人的学生——都会得到 4xx 拒绝。

---

## LLM 的使用（一处，非装饰）

放在**老师下课写课堂反馈**这个高频、费时、格式化的环节：

- 老师点「AI 生成反馈」，服务端用 OpenAI 兼容接口（`response_format: json_object`）生成草稿。
- 返回用 **zod 做结构化校验**，不符合 schema 直接丢弃。
- 任何失败（未配 key / 网络错误 / 校验不过）都**降级为手工填写**，系统照常工作。
- key 走环境变量 `LLM_API_KEY`（`server/.env`），**不提交仓库**。

配置：`server/.env` 中填 `LLM_API_KEY`（默认 `https://api.openai.com/v1`，`LLM_BASE_URL`/`LLM_MODEL` 可换任意 OpenAI 兼容服务）。不填也能完整演示（降级）。

---

## AI 工具使用说明

本次开发使用了 AI 编程工具（Claude Code 类）辅助，具体分工：

- **用了 AI 的环节**：脚手架搭建、Prisma schema 与 TypeScript 的样板代码、CSS 设计系统的初稿、seed 数据的铺写、端到端测试脚本的编写。
- **AI 给过但没采纳的建议**：
  1. AI 最初建议"学生表直接放 `credits` 字段"，我改成了独立的 `Enrollment` 表 + 多条记录，因为课时是"预付费账户"，需要支持多次购买、退费、逐笔追溯——单字段无法表达"钱"的语义。
  2. AI 建议"班级和课合成一张表"，我拆成了 `Class`（模板）+ `Lesson`（实例）两张表，否则"老师请假一周""补课"无法表达。
  3. AI 建议用多对多表达"学生↔顾问"，我改成 `Student.adminId` 的归属关系，保证跟进有唯一责任人。
- **DESIGN.md 里的判断（角色、取舍、规则、切片选择）是我自己做的**，代码每一处都能解释为什么这么写。

---

## 部署（可选）

前端是纯静态站，后端是无状态 API + SQLite 文件，都可一键部署：

- 前端 → Vercel / Netlify，构建命令 `npm run build`，产物目录 `web/dist`。
- 后端 → Render / Fly.io，`npm run build && npm start`；SQLite 建议换成 Postgres（`server/.env` 改 `DATABASE_URL`，schema 无需改动）。

本地跑通即可满足要求。

---

## 时间处理

系统业务时间统一用 `Australia/Melbourne`（含夏令时），通过 `Intl.DateTimeFormat` 的 `timeZone` 计算"今天"，无多时区切换逻辑。班级排期存 `dayOfWeek` + `HH:MM`，不存绝对时间戳。
