# 部署到 Vercel（含 SQLite → Postgres 迁移）

本项目前后端分离，部署为 **两个 Vercel 项目 + 一个 Neon Postgres**：

```
web/    (React + Vite)  ──►  Vercel 静态托管
server/ (Express + Prisma) ──►  Vercel Serverless Function（api/ 目录）
数据库                        ──►  Neon（Postgres，免费档）
```

> 为什么必须换 Postgres：SQLite 是文件数据库，而 Vercel Serverless 的文件系统是**临时的**（每次冷启动/重新部署就清空），数据会丢。所以上 Vercel 就一定要换成托管的 Postgres。

---

## 第 0 步 · 准备 Neon 数据库（约 5 分钟）

1. 注册 <https://neon.tech>（免费档够用），创建一个项目。
2. 拿到**两个**连接串，都要复制出来：

| 连接串 | 特征 | 用途 |
|---|---|---|
| **直连串**（direct） | 域名不含 `-pooler` | 本地跑 `prisma migrate` / `seed` |
| **池化串**（pooled） | 域名含 `-pooler` | Vercel 运行时（Serverless 下防连接数爆炸） |

---

## 第 1 步 · 把数据库从 SQLite 切到 Postgres

```bash
cd server

# 1. 改 provider（schema.prisma 只改这一行）
#    provider = "sqlite"   →   provider = "postgresql"

# 2. 删除 SQLite 方言的旧迁移（DATETIME/AUTOINCREMENT 不兼容 Postgres）
rm -rf prisma/migrations

# 3. 把 server/.env 的 DATABASE_URL 改成 Neon 直连串（先直连，用于建表）

# 4. 重新生成 Postgres 迁移并应用
npx prisma migrate dev --name init

# 5. 灌入演示数据（会写到 Neon）
npm run db:seed
```

模型结构（`schema.prisma` 里的表、字段、关系）**完全不用改**——所有主键都是 `String @default(cuid())`，字段全是跨方言类型，这是当初特意设计的。

---

## 第 2 步 · 部署后端到 Vercel

1. 先 `git push` 到 GitHub（见 README）。
2. Vercel → **Add New Project** → 导入该仓库。
3. 配置：
   - **Root Directory**：`server`
   - Framework Preset：`Other`（Vercel 会自动识别 `api/` 目录为 Serverless Function）
   - 其余构建命令留默认（`postinstall: prisma generate` 会自动执行）
4. **Environment Variables**：

| Key | 值 |
|---|---|
| `DATABASE_URL` | **Neon 池化串**（`-pooler`，追加 `&pgbouncer=true`） |
| `JWT_SECRET` | 随机字符串（如 `openssl rand -hex 32`） |
| `LLM_API_KEY` | 你的 LLM key（可选，不填则反馈降级为手写） |
| `LLM_BASE_URL` | 可选 |
| `LLM_MODEL` | 可选 |

5. Deploy。完成后记下后端域名，例如 `https://xxx-api.vercel.app`。

> 说明：`server/api/index.ts` 导出的 Express app 会被 Vercel 作为 Serverless Function 运行，`server/vercel.json` 把 `/api/*` 全部 rewrite 到它。`server/src/app.ts` 与本地 `src/index.ts` 共用同一份 app 逻辑。

---

## 第 3 步 · 部署前端到 Vercel

1. Vercel → **Add New Project** → 导入同一仓库（新建一个项目）。
2. 配置：
   - **Root Directory**：`web`
   - Framework Preset：`Vite`（build `npm run build`，产物 `dist`，一般自动识别）
3. **Environment Variables**：

| Key | 值 |
|---|---|
| `VITE_API_BASE_URL` | 后端域名，如 `https://xxx-api.vercel.app`（**末尾不要带 `/`**） |

4. Deploy。打开前端域名即可登录演示。

> 前端通过 `VITE_API_BASE_URL` 跨域访问后端；后端已 `app.use(cors())` 放行，无需额外配置。

---

## 第 4 步 · 验证

- 打开前端域名 → 用 `wangli@austin.edu` / `password123` 登录。
- 走一遍：工作台 → 学生详情 → 报名 → 排班 → 老师端点名扣课时。
- 确认 AI 反馈那步（配了 `LLM_API_KEY` 会出结构化输出，没配会降级手写）。

---

## 环境变量速查

| 服务 | 变量 | 必填 |
|---|---|---|
| Vercel 后端 | `DATABASE_URL`（Neon 池化串） | ✅ |
| Vercel 后端 | `JWT_SECRET` | ✅ |
| Vercel 后端 | `LLM_API_KEY` | 否 |
| Vercel 前端 | `VITE_API_BASE_URL` | ✅ |

---

## 常见问题

- **本地还能继续用 SQLite 开发吗？** 切到 Postgres 后，本地 `DATABASE_URL` 也要指向 Postgres（可以继续用 Neon 直连串，或本地装 Postgres）。如果暂时只想本地跑，可以先不执行第 1 步——本次代码改造（入口拆分、API base）全部向后兼容 SQLite。
- **连接报 `pgbouncer` 相关错**：确认运行时用的是**池化串**并带 `&pgbouncer=true`；`migrate`/`seed` 用**直连串**。
- **Serverless 冷启动慢**：Vercel 免费档第一次访问可能有几秒延迟，属正常；演示前先点一遍预热即可。
