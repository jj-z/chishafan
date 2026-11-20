# 吃啥饭 (ChiShaFan)

解决「吃啥饭」的多用户随机推荐 + 菜谱浏览应用：游客可浏览、登录后可收藏/记录就餐历史、AI 对话推荐，后台用 Element Plus 维护菜品与用户。

技术栈：Nuxt 4（全栈）+ Vant（用户端）+ Element Plus（后台）+ Prisma 7 / PostgreSQL + Zod + Pinia。详细约束见 [docs/tech-stack.md](docs/tech-stack.md)，业务规则见 [docs/domain.md](docs/domain.md)。

## 本地启动

环境要求：Node.js 20.19+、npm 10+、PostgreSQL 15+。

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（至少改 DATABASE_URL 与 NUXT_APP_SECRET）
cp .env.example .env

# 3. 建表 + 写入演示数据（6 分类 / 28 菜品 / 2 账号）
npx prisma migrate deploy
npm run db:seed

# 4. 启动
npm run dev   # http://localhost:3000
```

演示账号：

| 角色 | 邮箱 | 密码 |
|------|------|------|
| 管理员 | `admin@chishafan.local` | `admin1234` |
| 普通用户 | `demo@chishafan.local` | `user1234` |

## 环境变量

完整模板见 `.env.example`。服务启动时 `server/plugins/env-check.ts` 会校验必填项：生产环境缺失直接启动失败，开发环境只告警。

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | 是 | PostgreSQL 连接串 |
| `NUXT_APP_SECRET` | 是 | 会话加密密钥，**至少 32 字符**（AUTH-06）；生成：`openssl rand -base64 32` |
| `NUXT_APP_URL` | 邮件功能必填 | 站点根地址，用于拼接找回密码/邮箱换绑链接 |
| `NUXT_RESEND_API_KEY` | 邮件功能必填 | Resend HTTP API Key（AUTH-14/15） |
| `NUXT_MAIL_FROM` | 邮件功能必填 | 发件人，如 `吃啥饭 <no-reply@example.com>` |
| `NUXT_LLM_BASE_URL` | AI 功能必填 | OpenAI 兼容端点，如 `https://open.bigmodel.cn/api/paas/v4` |
| `NUXT_LLM_MODEL` | AI 功能必填 | 模型名，如 `glm-4-flash` |
| `NUXT_LLM_API_KEY` | AI 功能必填 | 供应商 API Key |
| `NUXT_AI_DAILY_QUOTA_USER` | 否 | 登录用户 AI 每日次数，默认 30（REC-07） |
| `NUXT_AI_DAILY_QUOTA_GUEST` | 否 | 游客按 IP 的 AI 每日次数，默认 5（REC-07） |
| `NUXT_AI_DAILY_TOKEN_USER` | 否 | 登录用户 AI 每日 token 额度，默认 50000（REC-12） |
| `NUXT_AI_DAILY_TOKEN_GUEST` | 否 | 游客按 IP 的 AI 每日 token 额度，默认 20000（REC-12） |
| `HISTORY_DAYS` | 否 | 推荐默认排除近几天吃过的菜，默认 3（DISH-05） |
| `AMBIENT_DEV_CITY` | 否 | 开发环境模拟定位城市，免去真实 IP 定位 |

> LLM 与邮件都是「要么全配、要么全不配」：只配一部分时启动日志会给出缺失项警告，对应功能会返回友好错误而不是崩溃。

## 常用脚本

| 命令 | 作用 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` / `npm run preview` | 生产构建 / 预览产物 |
| `npm run lint` / `npm run lint:fix` | ESLint 检查 / 自动修复 |
| `npm run format` / `npm run format:check` | Prettier 格式化 / 只检查 |
| `npm run typecheck` | vue-tsc 类型检查（含 `.vue` 模板） |
| `npm test` | Vitest 单元测试（不连数据库，秒级） |
| `npm run test:e2e` | 接口集成测试（启动真实服务，需先 migrate + seed） |
| `npm run db:generate` | 重新生成 Prisma Client |
| `npm run db:migrate` | 开发环境创建迁移（`prisma migrate dev`） |
| `npm run db:seed` | 幂等写入演示数据 |

## 测试与 CI

- 单测覆盖 Zod 契约、主食池权重、去重窗口优先级、地域/天气倍率上限。
- 集成测试覆盖 `/api/health`、菜品列表与搜索、未登录 401 边界、游客抽签、404 品牌页。
- `.github/workflows/ci.yml` 在 push / PR 时依次执行：`npm ci` → `prisma migrate deploy` → `db:seed` → `lint` → `format:check` → `typecheck` → `test` → `test:e2e` → `build`；CI 自带 PostgreSQL 16 服务。
- Windows 本地跑 e2e 使用 `setup({ dev: true })`，原因见 [docs/pitfalls.md](docs/pitfalls.md) 第 10 条。

## 部署

### 方式一：Docker Compose（推荐单机部署）

```bash
cp .env.example .env       # 修改 NUXT_APP_SECRET / 数据库密码 / LLM Key
docker compose up -d --build
docker compose run --rm seed   # 可选：首次写入演示数据
```

编排包含四个服务：`db`（PostgreSQL 16）、`migrate`（一次性执行 `prisma migrate deploy`）、`app`（Nitro 产物，非 root 用户运行）、`seed`（profile=tools，手动触发）。`app` 会等 `migrate` 成功后才启动，健康检查走 `GET /api/health`。

### 方式二：手动构建镜像

```bash
docker build -t chishafan .
docker run -d --name chishafan -p 3000:3000 \
  -e DATABASE_URL='postgresql://user:pass@host:5432/chishafan?schema=public' \
  -e NUXT_APP_SECRET='<32+ 字符随机值>' \
  chishafan
```

迁移必须在启动新版本前单独执行（多实例同时迁移会抢锁）：

```bash
npx prisma migrate deploy
```

### 方式三：Node 直接运行

```bash
npm run build
node .output/server/index.mjs   # 默认 3000 端口，可用 PORT / HOST 覆盖
```

### 上线检查清单

1. `NUXT_APP_SECRET` 已替换为随机值且 ≥ 32 字符。
2. 已执行 `prisma migrate deploy`，并确认 `/api/health` 返回 200。
3. 反向代理转发 `x-request-id`（未带时服务端会生成），日志可集中收集。
4. 邮件 / LLM 未配置时对应功能会返回 503 或友好提示，按需补齐。
5. 限流与 AI 配额是**进程内内存实现**，多实例部署前需替换为 Redis 等共享存储（见 `server/utils/rateLimit.ts`）。

## 数据库备份与恢复

生产库建议每日全量备份，并至少保留 7 天。仓库提供两个脚本（需在 Linux / WSL / Git Bash 下运行）：

```bash
# 备份到 ./backups，自动保留最近 7 天并生成 sha256 校验文件
DATABASE_URL='postgresql://...' ./scripts/backup-db.sh

# 恢复（必须显式确认；执行前先停止写入）
CONFIRM_RESTORE=yes DATABASE_URL='postgresql://...' ./scripts/restore-db.sh backups/chishafan-2026-01-01-030000.dump
```

等价的手工命令：

```bash
# 备份（-Fc 自定义格式，体积小且支持并行恢复）
pg_dump -Fc -h <host> -U <user> -d chishafan -f chishafan_$(date +%F).dump

# 恢复（先停止写入；恢复前建议再备份一次当前库）
pg_restore --clean --if-exists -h <host> -U <user> -d chishafan chishafan_2026-01-01.dump

# 仅验证备份可用（恢复到临时库，不影响生产）
createdb -h <host> -U <user> chishafan_restore_check
pg_restore -h <host> -U <user> -d chishafan_restore_check chishafan_2026-01-01.dump
```

Docker Compose 部署时把 `pg_dump` 命令放到宿主执行，连接串用 `DATABASE_URL` 中的地址；或使用 `docker compose exec db pg_dump ...`。恢复后必须重新验证 `/api/health` 与首页抽签，并检查 Prisma 迁移状态：`npx prisma migrate status`。

## 文档索引

- [docs/tech-stack.md](docs/tech-stack.md)：技术栈与工程约束
- [docs/domain.md](docs/domain.md)：业务规则（AUTH / DISH / MEAL / PREF / REC / TRACK …）
- [docs/assets.md](docs/assets.md)：可复用的 schema、工具与组件清单
- [docs/pitfalls.md](docs/pitfalls.md)：踩坑记录，写代码前先看
- [docs/plans/mvp-plan.md](docs/plans/mvp-plan.md)：MVP 执行计划与 P2 清单
- [docs/plans/acceptance.md](docs/plans/acceptance.md)：验收项
