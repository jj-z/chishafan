# 现有服务与工具清单

在开发新功能前，请先检查这里是否已经存在可复用的代码。**禁止重复造轮子。**

## 前后端共享工具 (`shared/utils/`)
- `formatDate(date: string | Date, format?: string)`：统一的日期格式化。**禁止再写新的日期格式化逻辑。**
- `dish.ts`：`STAPLE_POOL`、`pickStaple(categoryId, mealType)`（组合餐主食池加权，见 MEAL-05）、`ALLERGEN_LABELS`（过敏原中文名）、`SPICY_LABELS`、`PRICE_LABELS`、`MEAL_LABELS`、`SERVING_LABELS`、`ROLE_LABELS` 等展示与推荐常量，前后端共用。

## 共享类型 (`shared/types/`)
- `dish.ts`：`Dish`、`Category`、`Meal`、`MealType`、`ServingMode`、`DishRole`、`ALLERGEN_CODES` / `Allergen` 等领域类型。**接口返回值、组件 props、mock 数据必须复用这里，禁止在页面或 mock 文件里重复声明类型；过敏原编码只允许从 `ALLERGEN_CODES` 扩展。**
- `auth.d.ts`：扩展 nuxt-auth-utils 的会话用户类型（含可选的 `sessionVersion`，见 pitfalls #5）。

## 共享 Zod 契约 (`shared/schemas/`)
- 前端与后端共用同一份 schema，类型统一用 `z.infer` 推导，**禁止在页面/接口里重复声明请求响应类型**。
- `common.ts`：分页参数 `pageSchema`、列表响应 `pageResultSchema(items)`。
- `auth.ts`：`loginBodySchema` / `registerBodySchema` / `forgotPasswordBodySchema` / `resetPasswordBodySchema` / `confirmEmailBodySchema` / `forgotPasswordOkSchema` / `resetPasswordOkSchema` / `confirmEmailOkSchema` / `authOkSchema` / `sessionUserSchema`。
- `dish.ts`：`dishSchema`、`mealSchema`、`dishesQuerySchema`、`randomQuerySchema`（含 `excludeIds`、`includeRecent`、`historyDays`）、`randomResultSchema`（含 `ambient` / `preferenceApplied`）、`ambientSchema`、`weatherKindEnum`、`allergenEnum`、`dishListResultSchema`。`historyDays` 是用户可选的去重窗口（天，`0` 表示不按历史去重），优先级高于 `includeRecent`。
- `preference.ts`：`preferenceSchema`（喜欢/不喜欢菜系、过敏原、辣度与价格上限）、`DEFAULT_PREFERENCE`。
- `favorite.ts`：`favoriteListResultSchema`、`favoriteOkSchema`。
- `history.ts`：`historyBodySchema`、`historyOkSchema`、`historyTodaySchema`、`historyQuerySchema`、`historyListResultSchema`、`historyParamsSchema` / `historyDeleteOkSchema`（撤销单条记录，见 HISTORY-04）。
- `feedback.ts`：`feedbackBodySchema`（dishId）、`feedbackOkSchema`、`feedbackItemSchema` / `feedbackListResultSchema`（不感兴趣列表，含菜品与反馈时间，见 PREF-11）。
- `tracking.ts`：`recommendEventTypeEnum`（IMPRESSION/CLICK/DINE）、`recommendSourceEnum`（RANDOM/AI）、`recommendEventsBodySchema`（单批最多 50 条）、`recommendEventsOkSchema`（见 TRACK-01~04）。
- `dish.ts` 补充：`popularDishesResultSchema`（空结果兜底的热门菜数组，见 SEARCH-03）。
- `me.ts`：`meSummarySchema`（统计）、`meProfileSchema`（邮箱/手机号/昵称/待确认新邮箱 `pendingEmail`/待确认新手机号 `pendingPhone`，禁止包含 `passwordHash`）、`meProfileUpdateSchema`（昵称、手机号，以及需带 `currentPassword` 的邮箱/手机号修改，见 AUTH-11 / AUTH-16）、`meProfileUpdateResultSchema`（资料 + 可选 `devConfirmUrl` / `devCode`）、`mePhoneConfirmSchema` / `mePhoneConfirmResultSchema`（手机号换绑验证码，AUTH-16）、`mePasswordUpdateSchema`（当前密码 + 新密码）、`meOkSchema`。**资料页与 `/api/me/*` 必须复用。**
- `admin.ts`：后台契约。`adminDishSchema` / `dishWriteBodySchema` / `adminDishesQuerySchema`（含质量巡检 `missing`）/ `adminDishListResultSchema`、`adminCategorySchema` / `adminCategoryListSchema` / `categoryWriteBodySchema`、删除统一响应 `deleteOkSchema`；用户管理 `adminUserSchema` / `adminUsersQuerySchema` / `adminUserListResultSchema` / `adminUserUpdateSchema`（角色 + 禁用状态）/ `adminUserResetPasswordSchema` / `adminUserParamsSchema` / `adminUserOkSchema`（P2-11）；看板 `adminStatsQuerySchema` / `adminStatsSchema`（P2-12）；审计 `adminAuditLogSchema` / `adminAuditQuerySchema` / `adminAuditListResultSchema`（P2-13）；批量与导入 `adminDishBatchBodySchema` / `adminDishBatchResultSchema` / `adminDishImportBodySchema` / `adminDishImportResultSchema`（P2-15）。**后台页面与 `/api/admin/*` 必须复用这些 schema 与推导类型。**
- `recommend.ts`：AI 推荐契约。`recommendRequestSchema`（message + 可选多轮 history）、SSE 事件 `recommendDeltaEventSchema` / `recommendResultEventSchema`（text + 服务端回查的 dishes + ambient）/ `recommendErrorEventSchema` 与联合 `recommendEventSchema`。**聊天页与 `/api/recommend` 必须复用，事件分发用 switch(type)。**
  - 模型标记协议：`<<DISHES:["菜名1","菜名2"]>>`。**用菜名而不是 id**——暴露 id 会让模型把编号念进正文；服务端按菜名匹配候选反查真实菜品，正文里若仍残留内部 id 会被清洗。

## 后端工具 (`server/utils/`)
- `db.ts`：导出了单例 `prisma`，**禁止在接口里 new PrismaClient()**。
- `auth.ts`：包含 `requireAdmin(event)`、`requireActiveUser(event)` 与 `getOptionalActiveUser(event)`。三个函数都校验 `deletedAt: null` 与 `disabledAt: null`（禁用见 AUTH-17）。**所有管理后台接口第一行必须调用 `requireAdmin`；所有需要登录态的业务接口必须用 `requireActiveUser`（校验未注销/未禁用 + 会话版本一致，AUTH-12），禁止再直接调 `requireUserSession`；对游客开放的接口（随机推荐 / AI 推荐）用 `getOptionalActiveUser`，失效会话按游客处理，禁止直接读 `getUserSession().user.id`。**
- `adminAudit.ts`：`recordAdminAudit(tx, { adminId, action, targetType, targetId, detail })` 写后台操作审计（ADMIN-02 / ADMIN-04）。必须与业务更新放在同一个 `prisma.$transaction` 里；`targetType` 只允许 `USER` / `DISH` / `CATEGORY`；`detail` 只存变更后的值，**禁止传入密码明文或哈希**。批量操作可用 `tx.adminAuditLog.createMany`。
- `csv.ts`：`toCsv(headers, rows)` / `parseCsv(text)`，后台菜品导入导出专用（P2-15）。自实现而不是引第三方库：需求只有引号转义与换行状态机，行为必须和 Excel 一致（含 BOM、CRLF、字段内换行）。**禁止在接口里手写 CSV 拼接或 `split(',')` 解析。**
- `rateLimit.ts`：`assertLoginAllowed(event, account)` / `recordLoginFailure(event, account)` / `clearLoginFailures(event, account)`（登录失败限流）、`assertRegisterAllowed(event)`（注册按 IP 限流）、`assertPasswordResetAllowed(event, account)`（找回密码按 IP+邮箱限流）、`assertContactChangeAllowed(userId)`（邮箱/手机号换绑按用户限流）与 `consumeAiQuota(event, userId)`（AI 每日配额，REC-07）。**进程内内存实现，仅适用单实例部署**，新增限流场景必须复用它，禁止各接口手写计数器。
- `authToken.ts`：`generateToken(ttlMs)`（32 字节随机 token + SHA-256 哈希 + 过期时间）、`generateNumericCode()`（6 位数字验证码，手机号换绑用）、`hashToken(token)`、`buildAppUrl(path, token)`。**找回密码（AUTH-14）、邮箱换绑（AUTH-15）与手机号换绑（AUTH-16）必须复用，禁止各自生成 token/验证码或把明文存库。**
- `mail.ts`：`sendPasswordResetEmail(to, resetUrl)` / `sendEmailChangeVerificationEmail(to, confirmUrl)` 走 Resend HTTP API（原生 `$fetch`，超时 10s），配置 `NUXT_RESEND_API_KEY` / `NUXT_MAIL_FROM` / `NUXT_APP_URL`；未配置时返回 `{ sent: false }` 由接口决定开发兜底，**禁止在接口里直接 fetch 邮件服务**。
- `sms.ts`：`sendVerificationCode(phone, code)` 手机验证码短信通道（AUTH-16）。当前未接入供应商，固定返回 `{ sent: false }`，由接口在开发环境回传 `devCode`、生产环境返回 503；以后接阿里云/腾讯云只改这里，**禁止在接口里直接 fetch 短信服务**。
- `validate.ts`：`validateBody` / `validateQuery` / `validateParams` / `assertResponse`。**所有自定义 API 必须用它校验入参与响应**，不要手写 if 判断。
- `dish.ts`：`dishSelect`（统一字段子集）、`toDishDetail`（Prisma 行转 DTO）、`adminDishSelect` / `toAdminDish` / `toDishWriteData`（后台列表与新增/编辑共用）、`pickRandomMeal`（随机一餐核心逻辑，含忌口/辣度硬过滤与偏好/地域/天气加权）。**禁止在接口里重复实现抽签、去重、加权或字段映射逻辑**。
- `preference.ts`：`loadPreference(userId)`（读用户偏好，无记录返回默认值）、`isPreferenceApplied(preference)`（判断是否配置过偏好）。
- `ambient.ts`：`getAmbientContext(event)`（IP 定位 + 天气，fail-open、进程级缓存、只返回城市级信息）。
- `recommend.ts`：`loadRecommendContext(event, userId)`（合并偏好 + 地域 + 天气为 `RecommendContext`）、`toAmbientDto(context)`（转接口 DTO）。**随机推荐与 AI 推荐必须复用同一份上下文，禁止各写一套。**
- `llm.ts`：`getLlmConfig()`（读 `.env` 的 `NUXT_LLM_BASE_URL/MODEL/API_KEY`，未配置 Key 抛明确错误）、`streamChatCompletion(config, { messages, onDelta, signal })`（OpenAI 兼容流式调用，返回完整文本，超时 30s、无输出时重试一次、错误归一为中文提示）、`chatCompletion(config, { messages, tools, temperature, maxTokens, signal })`（非流式，返回 `content / toolCalls / usage`，Agent 决策阶段用）。**AI 接口禁止绕开它直接 fetch 大模型。**
- `embedding.ts`：`isEmbeddingConfigured()` / `getEmbeddingConfig()` / `embedTexts(texts)` / `embedQuery(text)` / `toVectorLiteral(vector)`。智谱 `embedding-3`、1024 维、单批 ≤64、15s 超时、维度不符立即报错。**检索与知识库同步必须复用它，禁止在接口里直接 fetch `/embeddings`。**
- `knowledge.ts`：`buildDishDocuments(row)`（菜品转知识片段）、`syncDishKnowledge(dishId)` / `removeDishKnowledge(dishId)` / `scheduleKnowledgeSync(ids)`（后台写入后异步重建）、`searchKnowledge(query, { topK, userId })`（pgvector 余弦检索，embedding 不可用时降级关键词匹配，未命中写 `RagMissLog`）。**向量 raw SQL 只允许写在这里。**
- `skills.ts` / `skillParse.ts`：`server/assets/skills/*.md` 的加载与解析。元数据是 HTML 注释中的 JSON 块（name / description / whenToUse / parameters），正文作为工具说明；`skills.ts` 通过 Nitro server assets（`useStorage('assets:server')`）读取并缓存，`skillParse.ts` 是纯函数，供单测复用。新增工具必须同时加 md 文件，并在 `tools.ts` 接线。
- `tools.ts`：`dispatchTool(name, argumentsJson, ctx)`，五个工具的白名单调度与 Zod 参数校验；`ToolContext` 由 `/api/recommend` 组装（候选、用户、偏好、分类映射）。未知工具或非法参数返回 `{ ok:false }`，禁止抛 500。
- `agentLoop.ts` / `agent.ts`：`runAgentLoop(deps, params)` 是纯循环（决策 ≤5 步 → 流式作答，含步数/预算/重复工具保护，可单测）；`agent.ts` 的 `runAgent(options)` 负责接线真实 LLM 与工具调度。**Agent 循环逻辑禁止在接口里重写。**
- `tokenQuota.ts` / `quotaMath.ts`：`getTokenQuota` / `chargeTokens`（数据库原子自增）/ `registerAiRequest` / `quotaSubject`（user:<id> 或 ip:<ip>）与纯函数 `tokenLimitFor` / `quotaDay` / `toQuotaSnapshot`。**Token 记账必须走它，禁止在接口里读-改-写计数。**
- `date.ts`：`todayDateOnly()` / `toDateOnlyString()`。**写 `@db.Date` 字段必须用它们**，否则东八区会少一天（见 pitfalls #9）。
- `dish.ts` 补充：`listRecommendCandidates(userId, context)`（AI 推荐候选池，硬过滤与随机推荐同一套规则，含近 7 天「不感兴趣」排除、点赞 ×1.5 软加权）与 `RecommendCandidate`（含 `mealType`，供 `recommend_dishes` 按餐别筛选）。**AI 候选必须走它，禁止另写过滤条件。**
- `server/api/dishes/popular.get.ts`：空结果兜底热门菜（近 30 天就餐次数 Top 6，不足用最新上架补齐，SEARCH-03）。游客可访问，禁止在页面里拼多个接口凑热门。

## AI 技能 (`server/assets/skills/`)
- `get-time.md` / `get-weather.md` / `recommend-dishes.md` / `search-knowledge.md` / `record-feedback.md`：每个文件 = 一个模型的 function call。元数据在 `<!-- skill-meta {...} -->` JSON 块里，正文是给模型看的使用说明与返回字段。
- 目录位于 `server/assets/skills`，由 Nitro 自动打包为 `assets:server`，运行时用 `useStorage` 读取并缓存（`server/utils/skills.ts`）。**不要用 `import ... from '*.md?raw'`**：Nitro 的服务端构建基于 Rollup，不识别 Vite 的 `?raw` 后缀。
- 新增技能两步：加 md 文件 → 在 `server/utils/tools.ts` 的 `dispatchTool` 增加分支（含 Zod 参数校验）。**禁止只加 md 不接线。**

## 前端组合式函数 (`app/composables/`)
- `useApi.ts`：`apiFetch(url, schema, options)`，请求并用 Zod 校验响应。**所有前端请求都走它**。
- `useAuth.ts`：`login` / `register` / `logout` / `requireLogin`（未登录跳登录页并带 redirect）。
- `useCategories.ts`：分类列表共享状态 + `categoryName(id)`，**禁止在页面里再写分类反查**。
- `useFavorites.ts`：收藏列表、`isFavorite`、`toggleFavorite`、`clearFavorites`。
- `useHistory.ts`：`isEatenToday`、`recordEaten`、`clearHistory`。
- `usePreferences.ts`：口味偏好共享状态，`loadPreference(force?)`、`savePreference(next)`、`clearPreference()`（退出登录时调用）。**偏好页与首页推荐必须复用，禁止页面各存一份。**
- `useHistoryDays.ts`：推荐去重窗口（天，0/3/7）共享状态，useState 跨页共享 + localStorage 持久化。**「我的」页设置与首页抽签必须复用它。**
- `useFeedback.ts`：`dislikeDish(dishId)` / `undoDislike(dishId)`，「不感兴趣」的标记与撤销（PREF-11）。**首页与反馈管理页必须复用，禁止各写一套请求。**
- `useRecommendTracking.ts`：`trackImpressions` / `trackClicks` / `trackDine` / `flushRecommendEvents`，推荐效果埋点队列（2s 防抖、满 20 条触发、`pagehide` 兜底），失败静默（TRACK-02/04）。**首页、AI 聊天与 DishCard 必须复用它。**
- `useSearchHistory.ts`：`history` / `loadSearchHistory` / `rememberSearch` / `clearSearchHistory`，菜品搜索历史存 localStorage（最多 10 条、去重置顶、可清空，SEARCH-01/02）。
- `useThemeMode.ts`：主题模式（light/dark/auto）共享状态，`isDark` 为生效明暗；app.vue 消费它切 `van-config-provider` 主题与 `<html>` 的 dark 类。**新增页面/组件不要自己读 localStorage 判明暗。**
- `usePageSeo.ts`：`usePageSeo({ title, description?, image? })` 统一设置标题 / 描述 / Open Graph，参数可传函数以跟随详情页数据（SEO-01）。**新增页面必须调用它，禁止各写一份 useHead。**
- `useAdmin.ts`（仅管理端使用）：`adminErrorMessage(err, fallback)` 统一取服务端错误文案、`useAdminCategories()` 提供后台分类下拉与 `categoryName(id)`、`formatAdminDateTime(iso)` 统一后台时间展示。**禁止在后台页面各写一份。**

## 管理后台页面与接口
- 布局：`app/layouts/admin.vue`（左侧菜单 + 顶部账号栏，只使用 Element Plus）。后台页面必须 `definePageMeta({ layout: 'admin' })`，禁止混用 Vant 组件。
- 页面：`/admin`（数据看板：总量、7/30 天趋势、热门菜 Top10、零结果搜索、AI 调用与失败率，P2-12）、`/admin/dishes`（筛选 + 分页 + 新增/编辑弹窗 + 删除确认 + 批量上下架/改分类 + CSV 导入导出 + 资料完整度巡检）、`/admin/categories`（列表 + 弹窗 + 删除确认）、`/admin/users`（用户搜索/角色与状态筛选、禁用/启用、角色变更、重置密码）、`/admin/audit-logs`（审计只读列表，按目标类型筛选，P2-13）。
- 接口：`server/api/admin/categories/{index.get,index.post,[id].put,[id].delete}.ts` 与 `server/api/admin/dishes/{index.get,index.post,[id].put,[id].delete}.ts`，每个 handler 第一行 `await requireAdmin(event)`；删除均为软删除，分类下仍有菜品时返回 409。写操作走事务并调用 `recordAdminAudit`。
- 看板与审计接口：`server/api/admin/stats.get.ts`（`days` 只接受 7/30，ADMIN-05）、`server/api/admin/audit-logs.get.ts`（只读 + `targetType` 筛选，ADMIN-04）。
- 批量与 CSV：`server/api/admin/dishes/batch.post.ts`（≤200 条，逐条审计）、`export.get.ts`（带 BOM 的中文表头 CSV）、`import.post.ts`（≤500 行、`dryRun` 预校验、失败行返回 Excel 行号，ADMIN-07）。
- 用户管理接口：`server/api/admin/users/index.get.ts`（列表）、`[id].patch.ts`（禁用/启用 + 角色变更）、`[id]/reset-password.post.ts`（重置密码）。写操作必须走事务并调用 `recordAdminAudit`；不能对自己执行禁用/改角色/重置密码（AUTH-17 / ADMIN-02）。

## 用户端接口 (`server/api/`)
- `/api/auth/`：`login` / `register` / `logout` / `forgot-password` / `reset-password` / `confirm-email`。找回密码必须走 `authToken.ts` + `mail.ts`，申请接口对不存在的邮箱也返回成功（防枚举），重置成功后自增 `sessionVersion`（AUTH-14）。邮箱换绑确认 `confirm-email` 允许未登录访问，成功后清空 pending 字段、不递增 `sessionVersion`（AUTH-15）。
- `/api/me/`：`summary.get.ts`（统计）、`profile.get.ts` / `profile.patch.ts`（资料读取与修改；改邮箱只写 `pendingEmail` 并发确认邮件，改手机号只写 `pendingPhone` 并发验证码，均需当前密码，AUTH-15 / AUTH-16）、`phone/confirm.post.ts`（手机验证码确认换绑，AUTH-16）、`password.patch.ts`（改密，校验当前密码并自增 `sessionVersion`）、`index.delete.ts`（账号注销，软删除 + 清会话，AUTH-12）。资料类接口必须先 `requireActiveUser`，响应禁止包含 `passwordHash`。
- `/api/feedback/`：`index.get.ts`（我的「不感兴趣」列表）、`index.post.ts`（标记不感兴趣，按 `userId + dishId + action` upsert 并刷新 7 天窗口）、`[id].delete.ts`（撤销，幂等硬删除）。均需 `requireActiveUser`；随机推荐与 AI 候选对 7 天内反馈的菜硬排除（PREF-11）。
- `/api/tracking/recommend-events.post.ts`：推荐效果埋点批量上报。登录/游客均可（`getOptionalActiveUser`，游客 `userId=null`），单批最多 50 条；按 `eventId` 唯一键 `skipDuplicates` 去重，不存在的 `dishId` 直接丢弃（TRACK-02/03/04）。

## 前端组件 (`app/components/`)
- `<DishCard />`：菜品列表展示卡片；可选 `track-source`（RANDOM/AI），传了才在点击时上报 CLICK 埋点。**禁止在列表页重新手写卡片 UI。**
- `<MealCard />`：一餐的展示容器（单品餐 / 组合餐 + 主食）；透传 `track-source` 给内部 DishCard。**首页推荐结果必须用它渲染，禁止把单道菜直接当一餐展示。**

## 用户端页面
- `/forgot-password`：输入邮箱申请重置链接；无论邮箱是否存在都提示「如果已注册，重置邮件已发送」，开发环境自动跳转到 `devResetUrl`。
- `/reset-password`：从 URL 读取 `token`，设置新密码（至少 8 位 + 确认密码）；成功后跳登录页，失效/复用提示重新申请。
- `/preferences`：口味偏好设置（喜欢/不喜欢菜系、忌口过敏原、辣度与价格上限），入口在 `/me`「口味偏好」。三组多选各自带「全选 / 取消全选」工具条（已全选时同一按钮切换为取消全选）。
- `/me/feedback`：「不感兴趣的菜」管理页，列出近 7 天会影响推荐的反馈，可逐条撤销；入口在 `/me`「不感兴趣的菜」（PREF-11）。
- `/me/profile`：个人资料（昵称、手机号、邮箱可改；改邮箱需填当前密码，并向新邮箱发确认邮件，点击链接后才生效；改手机号需填当前密码，并向新号码发短信验证码，输入验证码后才生效；修改密码需当前密码），入口是 `/me` 页头部整块。有待确认的新邮箱/手机号时展示提示条，手机号还展示验证码输入框。保存资料后必须 `session.fetch()` 同步头部昵称与邮箱。
- `/confirm-email`：邮箱换绑确认页，从 URL 读取 `token` 自动提交确认；展示加载中/成功/失败三态，成功后提示改用新邮箱登录（AUTH-15）。
- `/me` 注销账号：底部「注销账号」入口，`van-dialog` 二次确认文案必须写明「邮箱/手机号不可再注册、收藏与历史将保留但无法登录」，确认后调 `DELETE /api/me` 并清空本地收藏/历史/偏好缓存。
- `/chat`：AI 智能问答聊天页（SSE 流式打字机 + 真实菜品卡片），入口在首页「AI 帮我选」与 `/me`「AI 帮我选」；对话存 `useState('chat-messages')`，刷新才清空。**接口必须用原生 fetch 读流，禁止用 `apiFetch`/`$fetch`（会整体缓冲，拿不到逐块数据）。**

## 页面目录约定
- `app/pages/` 按语义路由组组织：`(auth)` 登录/注册、`(meal)` 首页/菜品库/详情/AI 聊天、`(account)` 收藏/就餐记录/口味偏好/我的/个人资料；`admin/` 保留真实路径 `/admin`。
- 路由组括号不进入 URL；新增页面必须放进对应语义组，禁止再往 `app/pages/` 根目录直接堆文件。

## 列表页约定
- 菜品库 `/dishes`、收藏 `/favorites`、就餐记录 `/history` 统一用 `van-pull-refresh` + `van-list` 实现「下拉刷新 + 上拉加载更多」，**不再用 `van-pagination` 分页器**。
- 菜品库搜索：最近搜索词存本机（`useSearchHistory`，可清空）；搜索/分类无结果时必须渲染相近分类与热门菜兜底，**禁止只留一句空文案**（SEARCH-01~03）。
- `van-list` 走官方标准路径：首屏请求由组件挂载时的初次检测触发 `@load` 驱动，**不要设 `:immediate-check="false"` 再手动请求**——实测会导致后续滚动触发失效、列表停在第一页。
- 翻页与「切分类 / 搜索 / 下拉刷新」共用同一个 `onLoad()` 追加逻辑；重置时清空列表、`page=1`、`finished=false` 再调 `onLoad()`。用自增的 `requestSeq` 丢弃过期响应，避免旧结果覆盖新列表。
- 二级页的 `van-nav-bar` 吸顶由全局样式 `body .van-nav-bar { position: sticky }` 统一处理（`body` 前缀用于压过 Vant 默认的 `position: relative`），**页面内不要再单独写 fixed/sticky**。

## 部署与运维资产
- `Dockerfile`：三阶段构建（deps / build / runner），额外 `migrator` target 供一次性迁移；**迁移禁止写进应用启动命令**。
- `docker-compose.yml`：`db`（必须用 `pgvector/pgvector:pg16`，官方 postgres 镜像不含 vector 扩展）+ `migrate` + `app`（+ `seed` profile），`app` 等 `migrate` 成功后再启动，健康检查走 `/api/health`。
- `scripts/db-embed.ts`：知识库向量全量回填（`npm run db:embed`），支持 `--force`（先清空片段）与 `--dry-run`（只统计）；向量化是收费操作，禁止在应用启动时自动执行。
- `.github/workflows/ci.yml`：唯一 CI 入口，依次执行 install → migrate/seed → lint → format:check → typecheck → test → test:e2e → build。
- `.env.example`：环境变量模板；`server/plugins/env-check.ts` 在启动时校验必填项与成组配置。
- `scripts/backup-db.sh` / `scripts/restore-db.sh`：备份（7 天保留 + sha256）与恢复演练（`CONFIRM_RESTORE=yes` 才执行）。

## 运维与错误处理
- `server/api/health.get.ts`：`GET /api/health`，真实 DB 探活（3s 超时），异常返回 503；契约在 `shared/schemas/health.ts`。负载均衡/监控统一走这里。
- `server/middleware/request-log.ts`：请求日志中间件，生成/透传 `x-request-id` 并记录 method/path/status/durationMs。**禁止记录请求 body。**
- `server/plugins/error-log.ts`：Nitro error 钩子，5xx 错误带 requestId 与堆栈输出单行 JSON；4xx 不按错误级别记录。
- `app/error.vue`：全局 404 / 500 品牌错误页。**禁止在页面内重复实现错误页。**

## 数据看板与审计数据源 (`prisma/models/`)
- `metrics.prisma`：`SearchLog`（只在关键词搜索零结果时写入，SEARCH-04）与 `AiCallLog`（AI 调用成功/失败、耗时、截断后的错误，P2-12）。看板必须查询这两张表，**禁止解析日志文件做统计**。
- `admin.prisma`：`AdminAuditLog` 用 `targetType` + `targetId` 多态引用，覆盖用户 / 菜品 / 分类的写操作（ADMIN-02 / ADMIN-04）；`detail` 只存变更后的值。

## SEO 与抓取
- `server/routes/robots.txt.ts` / `server/routes/sitemap.xml.ts`：按请求域名生成，不写死站点地址；`public/robots.txt` 已移除——静态文件优先级更高，会覆盖服务端路由。
- sitemap 只收录首页、菜品库与在架菜品详情（上限 2000 条），后台与个人数据页不收录（SEO-02）。

## 工程配置
- `eslint.config.mjs`：复用 `@nuxt/eslint` 生成的 `.nuxt/eslint.config.mjs`，只追加忽略项与项目规则。**禁止新增第二份 ESLint 配置。**
- `.prettierrc` / `.prettierignore`：格式化统一走 Prettier（单引号、无分号、行宽 100、LF）；`docs/`、生成物与 `package-lock.json` 不参与格式化。
- 脚本：`lint` / `lint:fix` / `format` / `format:check` / `typecheck`（`nuxt typecheck` 基于 vue-tsc）。合并前四条必须全绿，CI 直接复用。
- 测试：`vitest.config.ts`（纯逻辑，`tests/unit`）、`vitest.e2e.config.ts`（真实服务，`tests/e2e`）。脚本 `test` / `test:watch` / `test:e2e`。**新增纯函数优先补单测；接口行为变化必须同步 `tests/e2e/api.spec.ts`。**
- `server/utils/recommendBias.ts`：地域/天气 → 菜系倍率的纯函数（`buildCategoryBias`），不碰数据库、可单测；`recommend.ts` 只负责组装上下文。

## 第三方 API (如涉及)
- `ip-api.com`：IP → 城市/省份（免 Key，限流 45 次/分钟，服务端缓存 1 小时）。
- `wttr.in`：经纬度或城市 → 当前天气（免 Key，`format=j1`，服务端缓存 30 分钟）。
- 两者都必须在 `server/utils/ambient.ts` 内 fail-open；本地开发可用环境变量 `AMBIENT_DEV_CITY` 覆盖城市（localhost 是回环 IP，无法定位）。
- LLM（智谱 GLM，OpenAI 兼容端点 `https://open.bigmodel.cn/api/paas/v4/chat/completions`，模型 `glm-4-flash`）：Key 在 `.env` 的 `NUXT_LLM_API_KEY` 配置，切换 DeepSeek 等供应商只改 `NUXT_LLM_BASE_URL/MODEL`；调用一律走 `server/utils/llm.ts`，流式协议为 `data: {json}` 行 + `data: [DONE]` 结束。
- Embedding（智谱 `embedding-3`，OpenAI 兼容 `POST /embeddings`，默认 1024 维）：配置 `NUXT_EMBEDDING_BASE_URL` / `NUXT_EMBEDDING_MODEL` / `NUXT_EMBEDDING_API_KEY`，可选 `NUXT_EMBEDDING_DIMENSIONS`、`NUXT_RAG_THRESHOLD`；调用一律走 `server/utils/embedding.ts`。未配置时检索降级为关键词匹配，不阻塞功能。
- Resend（账号邮件）：`POST https://api.resend.com/emails`，配置 `.env` 的 `NUXT_RESEND_API_KEY`、`NUXT_MAIL_FROM`（形如 `吃啥饭 <no-reply@example.com>`，域名需在 Resend 验证）与 `NUXT_APP_URL`（生成重置/确认链接的站点根地址）。未配置时开发环境不真实发信，只在响应里返回 `devResetUrl` / `devConfirmUrl`。
- 短信（手机验证码）：**暂未接入供应商**（AUTH-16）。开发环境由接口返回 `devCode`，生产环境未配置时返回 503；接入阿里云/腾讯云时只改 `server/utils/sms.ts`，接口不感知供应商。