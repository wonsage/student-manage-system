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
3. 配置：
   - **Root Directory**：`server`
   - Framework Preset：`Other`（Vercel 自动识别 `api/` 为 Serverless Function）
   - 构建命令留默认（`postinstall: prisma generate` 会自动跑）
4. **Environment Variables**：

| Key | 值 |
|---|---|
| `DATABASE_URL` | **Neon 池化串**（`-pooler`，末尾追加 `&pgbouncer=true`） |
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
| `VITE_API_BASE_URL` | `https://xxx-api.vercel.app`（**末尾不要带 `/`**） |

4. Deploy，打开前端域名即可登录演示（后端已 `cors()` 放行跨域）。

---

## 4. 验证

- 打开前端域名 → `wangli@austin.edu` / `password123` 登录。
- 走一遍：工作台 → 学生详情 → 报名 → 排班 → 老师端点名扣课时 → AI 反馈。

---

## 环境变量速查

| 服务 | 变量 | 必填 |
|---|---|---|
| Vercel 后端 | `DATABASE_URL`（Neon 池化串 + `&pgbouncer=true`） | ✅ |
| Vercel 后端 | `JWT_SECRET` | ✅ |
| Vercel 后端 | `LLM_API_KEY` | 否 |
| Vercel 前端 | `VITE_API_BASE_URL` | ✅ |

---

## 常见问题

- **本地开发**：用根目录 `docker compose up -d db` 起 Postgres（端口 5433，与 `server/.env` 一致）。
- **`pgbouncer` 报错**：运行时用**池化串** + `&pgbouncer=true`；`migrate`/`seed` 用**直连串**。
- **冷启动慢**：Vercel 免费档首次访问有几秒延迟，属正常；演示前先点一遍预热。
- **想彻底重置本地库**：`docker compose down -v && docker compose up -d db && npx prisma migrate deploy && npm run db:seed`。
