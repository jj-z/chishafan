# 技术栈与版本约束

所有代码必须基于以下技术栈。未经人工允许，AI 不得擅自替换或引入功能重叠的新库。
下表版本为 2026-11 实测 npm registry 的结果，`package.json` 必须与此表保持一致。

| 类别 | 技术选型 | 版本约束 | 备注说明 |
|------|----------|----------|----------|
| 框架 | Nuxt 4 | ^4.6.4 | 使用 `app/` 目录结构 |
| ORM | Prisma | ^7.10.1 | 见下方《Prisma 版本陷阱》；`prisma/schema.prisma` 只放 generator + datasource，业务模型放 `prisma/models/`，Generator 输出到 `shared/generated/prisma` |
| 数据库 | PostgreSQL | >=15 | 全文搜索依赖 GIN 索引；AI 知识库依赖 **pgvector** 扩展，镜像必须用 `pgvector/pgvector:pg16`（官方 `postgres` 镜像不含扩展） |
| 校验 | Zod | ^4.6.7 | Schema 统一放置在 `shared/schemas/` |
| 状态管理 | Pinia | ^4.1.0 | 配套 `@pinia/nuxt` ^1.0.3；仅用于复杂跨组件状态，简单数据用 `useState` |
| 认证 | nuxt-auth-utils | ^0.6.2 | 基于密封 Cookie，禁止手写 JWT |
| UI（用户端） | Vant | ^4.10.2 | 配套 `@vant/nuxt` ^1.0.7，按需引入 |
| UI（管理端） | element-plus | ^2.14.8 | 配套 `@element-plus/nuxt` ^1.1.5 + `@element-plus/icons-vue` ^2.3.2 |
| 样式 | SCSS (sass-embedded) | ^1.108.1 | 所有组件统一 `<style lang="scss" scoped>`，禁止使用 Less/Stylus |

## Prisma 版本陷阱

npm 上 `prisma` 包的 `latest` 标签目前指向 `8.0.0-rc.33`（预发布版），而 `@prisma/client` 的 `latest` 是 `7.10.1`。
两者主版本必须一致，所以：

- **禁止直接执行 `npm install prisma`**，否则会装出「CLI 8 RC + Client 7」的组合，`prisma generate` 直接报错。
- 必须显式写版本：`prisma@^7.10.1` 与 `@prisma/client@^7.10.1`。
- Prisma 要求 Node `^20.19 || ^22.12 || >=24`，Node 18 无法运行。
- Prisma 7 只提供 TypeScript 客户端，运行时**必须**通过驱动适配器连接数据库：`new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`，依赖 `@prisma/adapter-pg` + `pg`，禁止再按 Prisma 6 的写法直接 `new PrismaClient()`。
- `prisma.config.ts` 必须显式 `import 'dotenv/config'`，Prisma 7 不再自动加载 `.env`。

## pgvector 与向量检索

- **Prisma 7 不支持 `vector` 类型**：`knowledge_chunks.embedding` 只能用 `Unsupported("vector(1024)")` 声明，Prisma Client 不会生成该字段，读写必须走 `$queryRaw` / `$executeRaw`。所有 raw SQL 只允许出现在 `server/utils/knowledge.ts`。
- 迁移里必须**先** `CREATE EXTENSION IF NOT EXISTS vector` 再建表；shadow database 也会执行同一份迁移，因此建库用户需要扩展权限。
- 索引固定用 **HNSW + `vector_cosine_ops`**（`m=16, ef_construction=64`），查询用余弦距离 `<=>`，相似度 = `1 - 距离`。不要改成 ivfflat：它需要先有数据训练，起步阶段召回不稳定。
- **维度在建表时定死**：当前为 1024（智谱 `embedding-3`）。换模型或改维度必须重建整张表与索引，且服务启动时不做自动迁移。
- 向量化未配置 `NUXT_EMBEDDING_API_KEY` 时，检索自动降级为关键词 bigram 匹配；该降级路径不得依赖网络。

## 样式规范

- 预处理统一用 **SCSS**，依赖为 `sass-embedded`（Dart Sass 的原生嵌入版，比纯 JS 版 `sass` 编译快一个量级，Vite 官方推荐）。
- 组件内样式一律写 `<style lang="scss" scoped>`。
- 全局变量、mixin、重置样式统一放在 `app/assets/styles/`，通过 `nuxt.config.ts` 的 `css` 字段引入，禁止在每个组件里 `@use` 同一份变量。
- 禁止使用 Less、Stylus、Tailwind、CSS-in-JS，避免构建链上出现两套样式方案。

## 测试策略

- 纯逻辑（schema、工具函数、推荐权重/去重窗口）走 `tests/unit`，由 `vitest.config.ts` 跑，不启动 Nuxt、不连数据库；**任何新的纯函数都应优先补单测**。
- 接口行为（健康检查、列表/搜索、鉴权边界、随机推荐、404 页面）走 `tests/e2e`，由 `vitest.e2e.config.ts` 通过 `@nuxt/test-utils/e2e` 启动真实服务，依赖已 migrate + seed 的数据库。
- `npm test` 只跑单测（快、无外部依赖）；`npm run test:e2e` 跑集成用例（Windows 下必须在 `setup({ dev: true })` 启动，产物模式会因 Nitro 软链在 teardown 报 `EEXIST/ENOTEMPTY`）。
- 断言业务规则时在测试名里标注编号（如 `DISH-05` / `AUTH-02`），方便对照 `docs/domain.md`。

## 运维与可观测性

- 健康检查：`GET /api/health` 必须真实执行 `SELECT 1`（3s 超时），正常 200、数据库不可用 503；响应契约见 `shared/schemas/health.ts`。**禁止用静态 200 冒充健康**，否则负载均衡无法摘除故障实例。
- 请求日志：`server/middleware/request-log.ts` 为每次请求生成/透传 `x-request-id`，请求结束时输出一行 JSON（method / path / status / durationMs / requestId）。**禁止记录 body**（登录密码、验证码、邮箱等敏感信息）。
- 错误上报：`server/plugins/error-log.ts` 把 5xx 与未知错误连同 requestId、路径、堆栈打到 stderr，由平台日志收集；`recommend.post.ts` 额外记录 `llm.recommend` 成功/失败事件（durationMs / candidateCount / ok），用于统计 LLM 失败率与 P95。这是不引入 Sentry 的等价方案，多实例部署需换成集中式日志。
- 统一错误页：`app/error.vue` 覆盖 404 / 500，禁止在页面里各自拼错误页；图片外链失效统一用占位（`DishCard`、菜品详情）。

## CI、部署与运维纪律

- CI 唯一入口 `.github/workflows/ci.yml`，顺序固定：`npm ci` → `prisma migrate deploy` → `db:seed` → `lint` → `format:check` → `typecheck` → `test` → `test:e2e` → `build`。**禁止在流水线里绕过脚本手写命令**；新增检查项必须同步进 workflow。
- 镜像采用三阶段 `Dockerfile`：`deps` → `build`（含 `prisma generate`）→ `runner`（只拷 `.output`，非 root 运行）。迁移是独立 `migrator` target，由 compose 的 `migrate` 一次性服务执行，**禁止把 `migrate deploy` 写进应用启动命令**（多实例会抢锁）。
- 启动环境校验 `server/plugins/env-check.ts`：生产缺 `DATABASE_URL` / `NUXT_APP_SECRET`（<32 字符）直接启动失败；LLM / Resend 只配一半时告警。新增必填环境变量必须同时改 `.env.example`、README 与该校验。
- 备份恢复：`scripts/backup-db.sh`（`pg_dump -Fc` + 7 天保留 + sha256）与 `scripts/restore-db.sh`（必须 `CONFIRM_RESTORE=yes`，恢复前停写）。恢复后必须 `prisma migrate status` + `/api/health` 复核。

## 性能基线与索引策略 (P2-20)

- 已落库索引：`dishes(isPublished, deletedAt)`（用户端列表 / 随机推荐的固定过滤条件）与 `favorites(dishId)`（按菜统计收藏）。迁移名 `add_query_indexes`。
- 本地基线（2026-11-11，`dishes=30`、`favorites=5`、`dining_histories=10`）：列表查询 `Execution Time 0.869ms`、收藏分组 `0.367ms`、7 日趋势 `0.090ms`，规划器均选择 `Seq Scan`——**这个数据量下走顺序扫描是正常的**，索引为数据增长预留，不能因此判定索引无效。
- 何时再优化：`dishes` 超过 5000 行或搜索 P95 超过 300ms，才启用 `pg_trgm` + GIN 支撑 `ILIKE`（DATA-06），并重新用 `EXPLAIN (ANALYZE, BUFFERS)` 记录前后对比。**禁止提前引入扩展或给低基数列加索引。**
- 慢查询排查顺序：先看执行计划是否走索引，再看是否缺少过滤条件（如漏掉 `deletedAt: null`），最后才考虑加索引或改 SQL。

## 工程质量校验

- 静态检查：`@nuxt/eslint`（生成 `.nuxt/eslint.config.mjs`）+ 根目录 `eslint.config.mjs`。**禁止新增第二份 ESLint 配置**，项目级规则只往根配置的 `rules` 里加。
- 格式化：Prettier（`.prettierrc`：单引号、无分号、行宽 100、LF）。ESLint 不开 stylistic，风格问题一律交给 Prettier，避免两套规则打架。
- 命令：`npm run lint` / `npm run lint:fix` / `npm run format` / `npm run format:check` / `npm run typecheck`。
- 合并前必须四条全绿；CI 与 `P2-18` 直接复用这些脚本，禁止在 CI 里另写一套命令。

### vue-tsc 与 Element Plus 表格的类型坑

- Element Plus 的表格插槽 `row` 类型是 `DefaultRow = Record<PropertyKey, any>`，直接传给强类型函数会报 `TS2345`，按枚举下标取值会报 `TS7053`。在模板里用 `row as AdminDish` / `row.mealType as MealType` 显式收窄，**禁止把业务函数参数改成 `any`**。
- 后台弹窗表单用 `ref<FormType>()`，不要用 `reactive<T>()` 的显式泛型写法：vue-tsc 的模板解包会把该绑定误判成 Ref，导致 `v-model` 报「Property 'value' does not exist」。

## 核心约束

1. 禁止在 `app/` 或 `shared/` 中导入任何 `server/` 目录下的代码。
2. 所有的 API 请求必须走 Nuxt 的 `useFetch` / `useAsyncData` / `$fetch`，禁止引入 Axios。
3. 日期处理统一使用 `shared/utils/formatDate`（内部基于原生 `Intl.DateTimeFormat`），禁止引入 moment.js。
4. UI 库分工：**用户端只能用 Vant，管理端只能用 Element Plus**。禁止在同一页面混用两套组件库，否则会出现样式互相覆盖、包体积翻倍。
5. 样式只走 SCSS 一条链路，规则见上方《样式规范》。
