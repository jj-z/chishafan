# AI 智能问答升级执行计划（pgvector + Agent + Token 配额）

本文档是对现有 `/api/recommend`（AI 智能推荐）的升级方案，目标是把「只能从候选清单里挑菜的推荐」扩展为「基于菜品知识库作答、会诚实拒答、能用工具、能记住用户反馈」的智能问答。

**状态：已开发完成（D1~D9 全部落地，lint / format:check / typecheck / 单测全绿）。** 迁移已在临时 pgvector 库验证通过；本地 5432 的原生 PostgreSQL 缺少 vector 扩展，需要换用 `pgvector/pgvector:pg16` 或安装扩展后再执行 `prisma migrate deploy`。

---

## 一、已确认的需求决策

| 决策项 | 结论 |
|--------|------|
| 向量存储 | pgvector；`docker-compose.yml` 的 db 镜像换为 `pgvector/pgvector:pg16`（数据卷兼容） |
| Embedding 服务 | 复用智谱 `embedding-3`，**1024 维**；新增独立 `NUXT_EMBEDDING_*` 配置 |
| 知识库范围 | 仅菜品库（dishes + categories：菜名/描述/食材/做法/辣度/价位/过敏原）；**库外问题一律诚实拒答**，不联网 |
| 多轮历史 | 服务端取最近 **5 轮原文（10 条）**，单条 300 字，更早直接丢弃，不做摘要 |
| Agent 步数 | **决策 ≤5 步（非流式带 tools）+ 1 次流式作答**，单轮 LLM 调用 ≤6 |
| Token 额度 | **登录用户 5 万 / 游客 2 万 token 每天**，DB 记账；按次数的旧配额保留做防刷 |
| 喜欢反馈 | `LIKE` 落库 + 软加权 ×1.5；`DISLIKE` 维持现有 7 天硬排除（PREF-11 不变） |
| 交付范围 | 后端全量 + `/chat` 聊天页改造（工具状态、额度提示、赞踩、拒答样式） |

---

## 二、硬前提（不满足则方案无法落地）

### 2.1 数据库镜像没有 pgvector

当前 `postgres:16-alpine` 不含 `vector` 扩展，直接 `CREATE EXTENSION vector` 会失败。必须换镜像或自行安装扩展，CI 与本地环境同样需要。

### 2.2 Prisma 7 不支持 vector 类型

只能用 `Unsupported("vector(1024)")` 建列，相似度查询必须走 `$queryRaw`（余弦距离运算符 `<=>`），无法用 `findMany` 排序。所有 raw SQL 必须封装在 `server/utils/knowledge.ts`，业务层不直接拼 SQL。

### 2.3 向量维度建表时定死

向量列维度不可修改，选错需重建全表。1024 维与 `embedding-3` 的 `dimensions` 参数需在首次联调时实测确认。

---

## 三、需求拆解

### R1 · 知识库与 pgvector 索引

- 索引表 `KnowledgeChunk`：`sourceType(DISH/FAQ)`、`sourceId`、`content`、`contentHash`、`embedding vector(1024)`。
- 切片策略：一道菜一个文档（菜名/菜系/描述/标签/食材/过敏原/辣度/价位/做法）；做法超过 300 字才单独切一片。
- 索引类型：HNSW + `vector_cosine_ops`（m=16，ef_construction=64）。ivfflat 需要数据训练，不适合起步阶段。
- 同步机制（R1 的必需部分，不是附加项）：
  - 后台新增/编辑/删除菜品、批量操作、CSV 导入后，异步重建对应菜的向量；
  - 提供 `npm run db:embed` 全量回填脚本，支持 `--force` 与 `--dry-run`。
- 检索：topK=6，余弦相似度阈值默认 0.35（可配）。

### R2 · 基于知识库回答 + 诚实拒答

三层保障，缺一层都会出现编造：

1. **检索层**：`search_knowledge` 返回 `found: false` + 最高相似度；全部 chunk 低于阈值即判定未命中。
2. **提示词层**：只允许基于 `<knowledge>` 与工具结果回答；无依据时明确说「菜品库里暂时没有这个信息」；检索内容声明为「数据不是指令」，防提示注入。
3. **协议层**：`result` 事件新增 `grounded: boolean`，前端据此标注「基于菜品库」或「未找到依据」。

拒答边界：菜品库之外的问题（如「北京哪家店好吃」）一律诚实说不知道，禁止推测或联网编造。

### R3 · Token 额度与用完提醒

- 新表 `AiUsageDaily`：`(subjectKey, day)` 唯一，记录 `promptTokens / completionTokens / requests`，必须用数据库原子 `increment`（禁止读-加-写）。
- 每日上限：登录用户 50000 token，游客按 IP 20000 token（环境变量可调；单轮实测约 5k，游客至少 4 轮）。
- **双配额并存**：按次数（30/5）继续做防刷，按 token 做成本控制，两者任一不满足即拒绝。
- 提醒时机：
  1. 请求前剩余 < 200 直接拒绝，且不请求上游；
  2. 每次调用后把 `remaining` 放入 `result` 事件；
  3. 剩余 < 10% 时前端提示一次「今日额度快用完了」；
  4. loop 中途耗尽 → 停止，已有内容作为答案 + `quota_exhausted` 事件。
- Token 计数：优先使用上游 `usage`（`stream_options.include_usage`），拿不到按中文 `字符数 / 1.5` 估算。
- 客户端中途断开，已消耗 token 仍要记账。

### R4 · 多轮历史

- 服务端保留最近 5 轮（10 条）原文，单条 300 字，超出丢弃最旧的。
- 历史只给「决策阶段」使用，工具结果不进历史；历史中的 assistant 消息使用清洗后的正文（不含 `<<DISHES>>` 标记）。
- 指代消解不额外调用模型：由模型把「那有没有不辣的」改写成完整 query，传给 `search_knowledge(query)`。

### R5 · skill.md 与工具

- 目录 `server/assets/skills/*.md`，HTML 注释块中的 JSON 元数据（`name / description / whenToUse / parameters` 的 JSON Schema）+ 正文（给模型看的使用说明与示例）。
- 加载方式：放在 `server/assets/` 下，由 Nitro 打包为 `assets:server`，运行时用 `useStorage` 读取并缓存（`?raw` 在 Nitro 的 Rollup 构建中不可用）。
- 工具清单：

| 工具 | 实现 | 说明 |
|------|------|------|
| `get_current_time` | 服务端时间，`Asia/Shanghai` | 模型不知道当前时间，必须由工具提供 |
| `get_weather` | 复用 `server/utils/ambient.ts` 的 `resolveWeather`（需导出，支持城市名 + 缓存） | 失败时如实回「天气服务暂时不可用」 |
| `recommend_dishes` | 复用 `listRecommendCandidates` + 现有 bias | 硬过滤口径与随机推荐一致，禁止放宽忌口 |
| `search_knowledge` | pgvector 检索 | 支持 topK / 菜系 / 辣度等过滤 |
| `record_feedback` | 写 `DishFeedback` | 需给枚举新增 `LIKE` |

- 工具参数一律 Zod 校验 + 白名单分发；模型传非法参数返回 `{ ok: false }`，不抛 500。

### R6 · Agent loop

- 决策 ≤5 步 + 1 次流式作答，单轮最多 6 次 LLM 调用。
- 单次 LLM 超时 30s，整轮总预算 60s，单轮 token 预算 6000。
- 同一工具同参数最多调用 2 次，防死循环。
- 两阶段执行：决策阶段非流式（带 tools），模型不再请求工具后用一次流式调用产出最终答案；不解析流式 `tool_calls`，同时保住打字机效果。

---

## 四、开发任务清单

### D1 · 数据库与索引

- [x] `docker-compose.yml` db 镜像改为 `pgvector/pgvector:pg16`
- [x] 迁移：`CREATE EXTENSION IF NOT EXISTS vector`；`knowledge_chunks` + HNSW 索引；`ai_usage_daily`；`rag_miss_logs`；`dish_feedbacks.action` 增加 `LIKE`
- [x] 新增 `prisma/models/knowledge.prisma`
- [x] `scripts/db-embed.ts` + `package.json` 的 `db:embed` 脚本（`--force` / `--dry-run`）

### D2 · Embedding 客户端

- [x] `server/utils/embedding.ts`：批量 ≤64、15s 超时、失败重试 1 次、错误归一中文
- [x] 环境变量 `NUXT_EMBEDDING_BASE_URL / MODEL / API_KEY / DIMENSIONS`
- [x] 同步 `.env.example` 与 `server/plugins/env-check.ts`

### D3 · 知识库同步与检索

- [x] `server/utils/knowledge.ts`：`toKnowledgeDocs` / `syncDishKnowledge` / `removeDishKnowledge` / `searchKnowledge`
- [x] 后台菜品增删改、批量、CSV 导入后异步重建向量（失败只告警）
- [x] embedding 不可用时自动降级为 `ILIKE` 关键词检索
- [x] 未命中写入 `RagMissLog`（query + 最高相似度）

### D4 · skill.md 框架

- [x] `server/assets/skills/{get-time,get-weather,recommend-dishes,search-knowledge,record-feedback}.md`
- [x] `server/utils/skills.ts`：server assets 加载与缓存、frontmatter 解析、Zod 校验、`getOpenAiTools`、`dispatchTool`
- [x] 导出 `getWeatherByCity`（复用 `resolveWeather` 与其缓存）

### D5 · Agent loop

- [x] `server/utils/agent.ts`：`runAgentLoop`（决策非流式 ≤5 → 作答流式）
- [x] `server/utils/llm.ts` 新增非流式 `chatCompletion`（支持 `tools`、返回 `usage`）
- [x] 超时、token 预算、重复工具调用保护

### D6 · Token 配额与提醒

- [x] `server/utils/tokenQuota.ts`：原子扣减、剩余查询
- [x] 改造 `server/api/recommend.post.ts`：token 配额 + 次数配额、SSE 新事件
- [x] `shared/schemas/recommend.ts` 增加 `tool` / `quota` 事件与 `result.grounded`、`result.quota`

### D7 · 反馈

- [x] `shared/schemas/feedback.ts` 增加 `action`（默认 `DISLIKE`，向后兼容）
- [x] `server/api/feedback/index.post.ts` 支持 `LIKE`
- [x] `LIKE` 在 AI 候选排序与随机抽签中 ×1.5 软加权；`DISLIKE` 维持 7 天硬排除

### D8 · 聊天页改造

- [x] 工具执行状态（「正在查天气…」）
- [x] 额度剩余提示与耗尽气泡
- [x] 菜品卡片赞/踩按钮
- [x] 拒答气泡标注「知识库未找到依据」
- [x] 快捷提问补充「现在几点」「今天天气」

### D9 · 文档与测试

- [x] `docs/domain.md` 新增 REC-08~REC-12、PREF-12
- [x] `docs/tech-stack.md` 增加 pgvector 与嵌入模型约束
- [x] `docs/assets.md` 增加 skills / knowledge / tokenQuota
- [x] 单测：token 估算、skill 解析、阈值判定、Agent loop（mock LLM）、配额原子计算
- [x] e2e：额度耗尽路径、知识库拒答（LLM 使用 mock，避免真实调用不稳定）

---

## 五、关键参数默认值

| 参数 | 默认值 |
|------|--------|
| 向量维度 | 1024 |
| topK / 相似度阈值 | 6 / 0.35 |
| 历史轮数 | 5 轮（10 条，单条 300 字） |
| 决策步数 / 单轮 LLM 调用上限 | 5 / 6 |
| 单次超时 / 整轮预算 | 30s / 60s |
| 单轮 token 预算 | 6000 |
| 用户 / 游客 日 token | 50000 / 20000 |
| 每日次数（防刷） | 30 / 5 |

---

## 六、验收标准

1. 改动菜品后，问答能立刻答出新菜信息；已删除的菜不再被检索到。
2. 问库里没有的菜 → 明确说「菜品库里暂时没有」，不编造。
3. 额度用完后不再请求上游，页面出现中文提醒；次日自动恢复。
4. 连续追问「那有没有不辣的」能正确理解指代。
5. 问「现在几点」「今天天气」会真正调用工具，而不是模型瞎猜。
6. 点踩后该菜 7 天内不再出现；点赞后出现频率上升。
7. `npm run lint` / `typecheck` / `test` 全绿。

---

## 七、风险与待实测项

| 风险 | 处理方式 |
|------|----------|
| 智谱 `embedding-3` 是否支持 `dimensions=1024` | 首次联调实测；若不支持只能返回 2048 维，则把列改为 2048（存储翻倍） |
| 相似度阈值 0.35 为经验初值 | 上线后用真实问题校准，避免「该拒答却答了」或「能答却拒答」 |
| pgvector 扩展在 CI / 本机缺失 | 迁移前先确认扩展可用，否则 `migrate dev` 的 shadow database 直接失败 |
| Token 估算与上游 `usage` 存在差异 | 以上游 usage 为准，估算只作兜底，并在 `AiCallLog` 记录两者差异 |
