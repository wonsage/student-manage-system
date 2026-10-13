# 部署到 Vercel（Postgres 已切换就绪）

本项目前后端分离，部署为 **两个 Vercel 项目 + 一个 Neon Postgres**：

```
web/    (React + Vite)  ──►  Vercel 静态托管
server/ (Express + Prisma) ──►  Vercel Serverless Function（api/ 目录）
数据库                        ──►  Neon（Postgres，免费档）
```

> 数据库已经从 SQLite 切到 Postgres（`schema.prisma` provider = `postgresql`，迁移文件已就绪）。本地开发用 Docker 起 Postgres，部署用 Neon。

---

## 0. 本地开发（已经能跑）

```bash
# 1. 起 Postgres（根目录）
docker compose up -d db

# 2. 后端：迁移 + 灌演示数据
cd server
npm install                    # 会自动 prisma generate
npx prisma migrate deploy
npm run db:seed

# 3. 启动
npm run dev                    # 后端 http://localhost:4000
cd ../web && npm run dev       # 前端（5173）
```

---

## 1. 准备 Neon 数据库（唯一需要你账号的步骤）

1. 注册 <https://neon.tech>（免费档够用），创建一个项目。
2. 复制**两个**连接串：

| 连接串 | 特征 | 用途 |
|---|---|---|
| **直连串**（direct） | 域名不含 `-pooler` | 本地跑 `migrate deploy` / `seed` 灌数据 |
| **池化串**（pooled） | 域名含 `-pooler` | Vercel 运行时（Serverless 防连接数爆炸） |

3. 把演示数据灌进 Neon（**本地执行，用直连串**）：

```bash
cd server
# 临时把 .env 的 DATABASE_URL 换成 Neon 直连串
npx prisma migrate deploy
npm run db:seed
# 之后 .env 恢复成本地 Docker 串即可（或保持 Neon 串直接连远程开发）
```

> 模型结构无需任何改动——所有主键是 `String @default(cuid())`，字段全跨方言类型，换库零迁移成本。

---

## 2. 部署后端到 Vercel

1. 先把仓库 push 到 GitHub（`git remote add` 后 push）。
2. Vercel → **Add New Project** → 导入该仓库。
3. 配置：构建参数已**写死在 `server/vercel.json`**（`framework: null`＝Other + `buildCommand: ""`＝跳过构建 + `outputDirectory: "public"`＋`public/.gitkeep` 占位），无需在后台手填。
   - **Root Directory**：`server`
   - **Framework Preset**：`Other`
   - **Build Command / Output Directory**：在 **Build & Development Settings** 里把这两项的 **Override 开关关掉**，让 `vercel.json` 生效。⚠️ 后台的 Override 值**优先级高于 vercel.json**——若后台开着 Override 且是 `npm run build` / `public`，会覆盖掉 vercel.json 的配置。
   - **Install Command**：`npm install`（默认即可）

   > 为什么这么配：本项目后端是纯 Serverless Function（入口 `api/index.ts`），不需要 `tsc`（`dist/` 只在本地 `npm start` 用）、也没有静态产物。所以跳过构建、用空 `public/` 目录满足输出检查即可。`postinstall: prisma generate` 在 `npm install` 阶段已自动执行，无需、也不可填进 Build Command。
4. **Environment Variables**：

| Key | 值 |
|---|---|
| `DATABASE_URL` | **Neon 池化串**（域名含 `-pooler`），保留 `?sslmode=require`，**去掉 `&channel_binding=require`**（见下方兼容性说明） |
| `JWT_SECRET` | 随机串（`openssl rand -hex 32`） |
| `LLM_API_KEY` | 可选（不填则反馈降级手写） |
| `LLM_BASE_URL` / `LLM_MODEL` | 可选 |

5. Deploy，记下后端域名 `https://xxx-api.vercel.app`。

> `server/api/index.ts` 导出 Express app 作为 Serverless Function，`server/vercel.json` 把 `/api/*` rewrite 到它；`server/src/app.ts` 与本地 `src/index.ts` 共用同一份逻辑。

---

## 3. 部署前端到 Vercel

1. Vercel → **Add New Project** → 导入同一仓库（新建项目）。
2. 配置：**Root Directory** `web`，Framework Preset `Vite`（自动）。
3. **Environment Variables**：

| Key | 值 |
|---|---|
| `VITE_API_BASE_URL` | `https://xxx-api.vercel.app`（**只填域名，不要带 `/api` 前缀、也不要末尾 `/`**——`/api` 已由前端代码 `api.ts` 统一拼接，多填会变成 `api/api` 而 404） |

4. Deploy，打开前端域名即可登录演示（后端已 `cors()` 放行跨域）。

---

## 4. 验证

- 打开前端域名 → `wangli@austin.edu` / `password123` 登录。
- 走一遍：工作台 → 学生详情 → 报名 → 排班 → 老师端点名扣课时 → AI 反馈。

---

## 数据自动刷新（推荐，避免演示数据过期/被污染）

seed 生成的「今日课程」是相对执行日的绝对日期，跨天后会过期；演示操作也会污染数据。仓库内置了 GitHub Actions 定时任务，**每天 Melbourne 早上自动重置 Neon**，也可手动一键重置。

1. GitHub 仓库 → **Settings → Secrets and variables → Actions → New repository secret**：
   - 名称 `NEON_DATABASE_URL`，值为 Neon **直连串**（去掉 `&channel_binding=require`，见下方「连接串兼容性」）。
2. 无需其他配置——`push` 到默认分支后，`.github/workflows/reset-demo.yml` 自动生效（每天 UTC 21:00 跑一次）。
3. 手动立即重置：GitHub → **Actions → Reset demo data → Run workflow**。
4. 本地兜底：`./scripts/reset-demo.sh`（`server/.env` 指向 Neon 直连串时直接重置线上）。

---

## 环境变量速查

| 服务 | 变量 | 必填 |
|---|---|---|
| Vercel 后端 | `DATABASE_URL`（Neon 池化串，仅 `?sslmode=require`） | ✅ |
| Vercel 后端 | `JWT_SECRET` | ✅ |
| Vercel 后端 | `LLM_API_KEY` | 否 |
| Vercel 前端 | `VITE_API_BASE_URL` | ✅ |

---

## 连接串兼容性（重要）

Neon 控制台默认给出的连接串末尾带 `&channel_binding=require`，但 **Prisma 6 不支持该参数，会报 `P1001 Can't reach database server`**（已实测）。部署时务必：

- **直连串**（本地 migrate/seed）：保留 `?sslmode=require`，删掉 `&channel_binding=require`。
- **池化串**（Vercel 运行时）：同样保留 `?sslmode=require`，删掉 `&channel_binding=require`；**不要**加 `&pgbouncer=true`（Prisma 6 已废弃，实测同样报错）。

两者都已在本机直连 Neon 实测连通。

## 常见问题

- **本地开发**：用根目录 `docker compose up -d db` 起 Postgres（端口 5433，与 `server/.env` 一致）。
- **报 `P1001` 连不上**：连接串里是否残留 `&channel_binding=require` 或 `&pgbouncer=true`？去掉后只留 `?sslmode=require`。
- **冷启动慢**：Vercel 免费档首次访问有几秒延迟，属正常；演示前先点一遍预热。
- **想彻底重置本地库**：`docker compose down -v && docker compose up -d db && npx prisma migrate deploy && npm run db:seed`。
