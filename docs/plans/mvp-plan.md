# MVP 执行计划

我们的目标是先跑通核心闭环，不追求大而全。按照以下步骤执行，**每完成一步必须经过验收（见 `acceptance.md`）**。

## 已确认的需求决策

| 决策项 | 结论 |
|--------|------|
| 用户形态 | 多用户注册 + 管理后台（游客可浏览，登录后可收藏，ADMIN 维护数据） |
| 首版范围 | 随机推荐、列表、搜索、详情、收藏、就餐历史与去重、管理后台 |
| 推荐方式 | 随机前可按分类/餐别筛选，`excludeIds` 保证「换一个」不重复，默认排除近 3 天吃过的 |
| UI 方案 | 用户端 Vant，管理端 Element Plus（禁止混用） |
| 图片 | 后台上传（本地磁盘 + ADMIN 鉴权）或填外链，详见 DISH-07 |
| AI 推荐 | 二期（P1），不阻塞一期 |
| 包管理器 | npm（仓库使用 `package-lock.json`） |

## 实现过程中新增的需求

> 以下条目在阶段零实施过程中被提出并落地，**不是原计划 21 项的遗漏，而是增量需求**。

| 编号 | 需求 | 落点 | 状态 |
|------|------|------|------|
| N1 | 推荐最小单位从「一道菜」改为「一餐」，单品餐 / 组合餐（米饭 + 1~3 道菜）两种形态 | `shared/types/dish.ts` + `prisma/models/dish.prisma` 新增 `ServingMode` / `DishRole` 枚举 + 首页抽签逻辑 | ✅ 已完成 |
| N2 | 类型与展示常量从 `app/mock/` 抽到 `shared/types/` 和 `shared/utils/`，前后端共享 | 三个 shared 文件 + 所有组件改写 import | ✅ 已完成 |
| N3 | `schema.prisma` 放 `prisma/` 根目录只存 generator + datasource，业务模型全部放 `prisma/models/`（Prisma 配置为递归扫描） | 4 个 `models/*.prisma` 文件 + `prisma.config.ts` | ✅ 已完成 |
| N4 | `User` 登录标识改为邮箱唯一 + 手机号可选唯一，删除 `username`，加 `nickname` 做展示 | `prisma/models/user.prisma` | ✅ 已完成 |
| N5 | `User` / `Category` / `Dish` 三张表加 `deletedAt` 软删除；`Favorite` 硬删，`DiningHistory` 保留 | DATA-01~05 | ✅ 已完成 |
| N6 | 固定枚举值（Role / MealType / ServingMode / DishRole）使用 Prisma enum；菜系由 Category 表承载 | DATA-04 | ✅ 已完成 |
| N7 | PostgreSQL 唯一约束 + 软删除：注销后邮箱不可复用，不走拼接 `_deleted` 等应用层绕过 | DATA-03 | ✅ 已完成 |
| N8 | SCSS 作为唯一样式方案，组件内 `lang="scss" scoped`，全局样式 `app/assets/styles/main.scss` | `nuxt.config.ts` css 字段 | ✅ 已完成 |
| N9 | 提前实现 demo 验证用的用户端首页 / 菜品库 / 详情 / 收藏 / 我的（纯前端 mock，不连服务端） | `app/pages/` 下 5 个路由 + `MealCard` / `DishCard` 组件 | ✅ 已完成 |
| N10 | 提前跑通 `prisma migrate dev` 建表 + `prisma/seed.ts` 幂等写入 6 分类 / 28 菜品 / 2 用户 / 演示收藏与历史 | `prisma/migrations/` + `prisma/seed.ts` + `package.json db:seed` | ✅ 已完成 |
| N11 | 五个用户端页面与详情接入真实 API；请求、表单、响应统一用 `shared/schemas/` 的 Zod 校验 | 前后端共用 Zod schema 与推导类型，页面已停止使用 mock 与 `useDemoStore`（该 composable 已删除） | ✅ 已完成 |
| N12 | 首页/菜品库/收藏/我的四个主 tab 开启 KeepAlive；切 tab 保留首页抽签与列表筛选，收藏/我的重新进入时刷新；登录/注册/详情不缓存 | 页面 `keepalive` + `onActivated` | ✅ 已完成 |
| N13 | 游客可浏览，收藏/就餐历史需登录并保留 redirect；我的页支持登录/注册/退出，退出清空用户相关状态 | 共享认证与收藏 composable | ✅ 已完成 |
| N14 | 就餐历史页：二级页 `/history`，按日期分组展示「哪天吃了哪道菜」，支持分页；入口在「我的」页的就餐记录数 | `app/pages/(account)/history.vue` + `GET /api/history` | ✅ 已完成 |
| N15 | 搜索不新开接口，改为 `GET /api/dishes` 增加 `keyword` 参数（复用分类+分页与同一份 Zod schema）；入口放菜品库页顶部 | `shared/schemas/dish.ts` + `server/api/dishes/index.get.ts` + `app/pages/(meal)/dishes/index.vue` | ✅ 已完成 |
| N16 | 管理后台：`/api/admin/*` 统一 `requireAdmin` + 分类/菜品 CRUD（软删除）；Element Plus 布局与菜品、分类两个列表页（筛选、分页、弹窗表单、删除确认） | `shared/schemas/admin.ts` + `server/api/admin/**` + `app/layouts/admin.vue` + `app/pages/admin/*` | ✅ 已完成 |
| N17 | 口味偏好：新增 `UserPreference`，忌口/过敏为硬过滤，不喜欢的菜系只做软降权（PREF-01~05） | `prisma/models/preference.prisma` + `server/api/preferences/*` + `app/pages/(account)/preferences.vue` | ✅ 已完成 |
| N18 | 主食扩展：`Meal.staple` 改为全局主食池加权（米饭/馒头/面条/粥/饼），主食仍不是 Dish 记录（MEAL-05） | `shared/utils/dish.ts` + `server/utils/dish.ts` | ✅ 已完成 |
| N19 | 定位与天气：仅用 IP 定位 + 天气，作为随机推荐的软偏好上下文，失败必须 fail-open | `server/utils/ambient.ts` + `server/utils/recommend.ts` | ✅ 已完成 |
| N20 | 过敏原：Dish 增加受控 `allergens` 枚举数组，后台多选维护，推荐按用户忌口硬过滤 | `prisma/models/dish.prisma` + `shared/schemas/preference.ts` + 后台表单 | ✅ 已完成 |
| N21 | 甜品/烘焙：本期明确不做，待后续单独立项，不进入分类与推荐 | — | ⏸ 已后置 |
| N22 | AI 推荐接智谱 GLM（OpenAI 兼容端点），供应商由 `.env` 的 `NUXT_LLM_BASE_URL/MODEL/API_KEY` 决定，换 DeepSeek 只改配置不改代码；未配置 Key 时返回友好提示 | `server/utils/llm.ts` + `.env` | ✅ 已完成 |
| N23 | AI 结果形态：服务端先按忌口/辣度硬过滤候选，候选清单进 prompt 让模型挑选；回复末尾 `<<DISHES:[...]>` 标记由服务端解析，菜品一律回查数据库组装，禁止模型幻觉 | `server/api/recommend.post.ts` + `server/utils/dish.ts` `listRecommendCandidates` | ✅ 已完成 |
| N24 | 聊天页交互：`POST /api/recommend` 以 SSE 流式返回，前端 fetch + ReadableStream 读流实现打字机效果；支持多轮 history（最多 6 轮） | `shared/schemas/recommend.ts` + `app/pages/(meal)/chat.vue` | ✅ 已完成 |
| N25 | 二级页顶部栏吸顶：全局 `body .van-nav-bar { position: sticky }` 统一处理（提高权重压过 Vant 默认 `relative`） | `app/assets/styles/main.scss` | ✅ 已完成 |
| N26 | 列表页无缝滚动：菜品库 / 收藏 / 就餐记录改为 `van-pull-refresh` + `van-list`，上拉加载更多 + 下拉刷新，移除分页器 | `app/pages/(meal)/dishes/index.vue` + `app/pages/(account)/favorites.vue` + `app/pages/(account)/history.vue` | ✅ 已完成 |
| N27 | 口味偏好多选全选：三组多选（喜欢 / 不喜欢菜系、忌口过敏原）各加「全选 / 取消全选」两态按钮 | `app/pages/(account)/preferences.vue` | ✅ 已完成 |
| N28 | 推荐去重窗口可选：在「我的」页设置 不限 / 3 天 / 7 天（`historyDays`，默认 3 天），cell 点击弹 `van-action-sheet` 底部选择，useState + localStorage 本地持久化，首页抽签读取共享值，改完切回首页自动重抽 | `app/composables/useHistoryDays.ts` + `app/pages/(account)/me/index.vue` + `app/pages/(meal)/index.vue` + `shared/schemas/dish.ts` + `server/utils/dish.ts` | ✅ 已完成 |
| N29 | 筛选统一为「行 + 底部弹层」：首页餐别/分类、菜品库分类由多行 chips 改为 `FilterSheetSelect` 组件（当前值 + 箭头，点击弹 action-sheet），节省首屏空间 | `app/components/FilterSheetSelect.vue` + `app/pages/(meal)/index.vue` + `app/pages/(meal)/dishes/index.vue` | ✅ 已完成 |
| N30 | 底部导航只在主 tab 显示：按路由白名单（`/`、`/dishes`、`/favorites`、`/me`）判断，二级页（聊天/记录/偏好/详情/登录注册）不渲染 tabbar 且去掉底部留白 | `app/layouts/default.vue` | ✅ 已完成 |
| N31 | 主题设置与暗夜模式：「我的」页三档（明亮/暗夜/跟随系统），`van-config-provider` 切 Vant 深色 + `html.dark` 覆盖全局 `--app-*` 变量；主题色保持静态待设计稿 | `app/composables/useThemeMode.ts` + `app/app.vue` + `app/assets/styles/main.scss` + `app/pages/(account)/me/index.vue` | ✅ 已完成 |
| N32 | 个人资料：新增 `/me/profile` 二级页，昵称/手机号可改，邮箱修改需验证当前密码（P2-05 放开），修改密码需当前密码；不做头像；保存后刷新会话同步「我的」头部昵称（AUTH-07~11） | `shared/schemas/me.ts` + `server/api/me/profile.*` + `server/api/me/password.patch.ts` + `app/pages/(account)/me/profile.vue` + `app/pages/(account)/me/index.vue` | ✅ 已完成 |
| N33 | 页面目录改为语义路由组：`(auth)` 登录/注册、`(meal)` 首页/菜品库/详情/AI 聊天、`(account)` 收藏/就餐记录/口味偏好/我的/个人资料；括号不进入 URL，所有路由地址保持不变 | `app/pages/` 目录调整 | ✅ 已完成 |
| N34 | 邮箱修改升级为「邮件确认后换绑」（AUTH-15）：`User` 增加 `pendingEmail` / `pendingEmailTokenHash` / `pendingEmailExpiresAt`，PATCH 只写待确认字段并发信，新增 `POST /api/auth/confirm-email` 与 `/confirm-email` 确认页，确认后才真正改写 `email`；复用 `authToken.ts` + `mail.ts`，不新增依赖 | `prisma/models/user.prisma` + `shared/schemas/{me,auth}.ts` + `server/api/me/profile.*` + `server/api/auth/confirm-email.post.ts` + `app/pages/(account)/me/profile.vue` + `app/pages/(auth)/confirm-email.vue` | ✅ 已完成 |
| N35 | 手机号换绑升级为「短信验证码确认后换绑」（AUTH-16，用户口径的 P2-06）：`User` 增加 `pendingPhone` / `pendingPhoneCodeHash` / `pendingPhoneExpiresAt` / `pendingPhoneAttempts`，PATCH 只写待确认字段并下发 6 位验证码（5 分钟、最多输错 5 次、重新申请覆盖），新增 `POST /api/me/phone/confirm`；未接入短信商，开发环境回传 `devCode`，生产未配置返回 503 | `prisma/models/user.prisma` + `shared/schemas/me.ts` + `server/api/me/profile.*` + `server/api/me/phone/confirm.post.ts` + `server/utils/{authToken,rateLimit,sms}.ts` + `app/pages/(account)/me/profile.vue` | ✅ 已完成 |
| N36 | 会话失效机制补齐公开接口（用户口径的 P2-07）：新增 `getOptionalActiveUser`，随机推荐与 AI 推荐对失效会话按游客处理，不再沿用旧 `userId` 读取偏好/历史或扣账号配额；防止改密/注销后旧 cookie 在公开接口上继续生效 | `server/utils/auth.ts` + `server/api/dishes/random.get.ts` + `server/api/recommend.post.ts` | ✅ 已完成 |

## 阶段零：地基（P0）

- [x] 1. 执行 `npm install` 安装依赖（`package.json` 已就绪）。
- [x] 2. 配置 `nuxt.config.ts`：注册 `@pinia/nuxt`、`@vant/nuxt`、`@element-plus/nuxt`、`nuxt-auth-utils`。
- [x] 3. `prisma/schema.prisma` 只放 generator + datasource；业务模型按领域拆分到 `prisma/models/`；`prisma.config.ts` 的 `schema` 指向 `prisma` 目录以递归扫描。**先只跑通 `prisma generate` 再写业务代码**，避免 Prisma 7 路径问题返工。
- [x] 4. 定义 `User` / `Category` / `Dish` / `Favorite` / `DiningHistory` 五张表并执行首次 migrate。
- [x] 5. 实现 `server/utils/db.ts`：用 `@prisma/adapter-pg` 构造 `PrismaPg`，并以 `globalThis` 缓存客户端（见 pitfalls #2）。
- [x] 9. 编写 Seed 脚本，插入分类与菜品（含 `servingMode` 单品/配菜、`role` 主菜/素菜/汤、`mealType`、辣度、预算、标签、`imageUrl`）。**提前完成**，原属阶段二，现阶段零已落地幂等 upsert + 28 菜 / 6 分类 / 2 用户 / 演示收藏历史。

## 阶段一：认证（P0）

> 前置：测试账号已就绪 —— admin@chishafan.local / admin1234（ADMIN），demo@chishafan.local / user1234（USER）。

- [x] 6. 实现注册 / 登录 / 登出 API（邮箱 + 密码，手机号可选），密码走 Scrypt 哈希（与 `prisma/seed.ts` 里 `@adonisjs/hash` 默认配置完全一致）。
- [x] 7. 用户端用 Vant 实现登录页、注册页。
- [x] 8. 路由中间件：未登录访问 `/admin` 自动跳转，非 ADMIN 返回 403（AUTH-02/03）。

## 阶段二：核心业务（P0）

- [x] 10. 实现 `GET /api/dishes/random`：按单品餐 / 组合餐两种形态组装「一餐」（1 主菜 + 可选素菜 + 可选汤），叠加分类/餐别筛选、`excludeIds`、近 3 天历史去重、空池降级（MEAL-01~08）。
- [x] 11. 首页：用 `MealCard` 展示一餐（单品 / 米饭 + 多菜）+「换一个」+ 筛选条件。
- [x] 12. 实现 `GET /api/dishes` 列表接口（分类筛选 + 分页），并实现用户端列表页。
- [x] 13. 实现菜名搜索（`GET /api/dishes` 增加 `keyword`，PostgreSQL `ILIKE` 模糊匹配），菜品库页顶部接入 Vant 搜索框，带 300ms 防抖。
- [x] 14. 实现菜品详情页 + 收藏/取消收藏 API（幂等，FAV-02/03）。
- [x] 15. 实现我的收藏页。
- [x] 16. 实现 `POST /api/history`「今天就吃它」，写入就餐历史（HIST-01~03）。

## 阶段三：管理后台（P0）

- [x] 17. 实现 `requireAdmin`（`server/utils/auth.ts`）。
- [x] 18. 实现分类/菜品的 CRUD API。
- [x] 19. 用 Element Plus 实现后台列表、表单页（图片填外链 URL）。

## 阶段三点五：推荐增强（P0.5，P1 前置）

> P1 的 AI 推荐必须复用这里的候选过滤与偏好上下文，避免随机与 AI 两套逻辑漂移。
> 已确认：忌口硬过滤 + 不喜欢软降权；主食走全局主食池加权；仅 IP 定位 + 天气；甜品/烘焙本期不做。

- [x] 22. 新增 `Allergen` 枚举与 `Dish.allergens`，后台菜品表单支持多选维护。
- [x] 23. 新增 `UserPreference`（喜欢/不喜欢菜系、忌口过敏原、辣度上限、价格上限）与 `GET/PUT /api/preferences`。
- [x] 24. 用户端新增「口味偏好」页（`/preferences`），入口放「我的」页；退出登录时清空偏好缓存。
- [x] 25. 随机推荐接入硬过滤（过敏原、辣度上限）与软权重（喜欢菜系、不喜欢菜系、价格、地域、天气），
       权重在 SQL 层用 `-LN(RANDOM()) / weight` 实现加权随机；硬过滤导致无候选时返回空态，禁止放宽忌口（修订 DISH-02 / MEAL-08）。
- [x] 26. 主食改为全局主食池（米饭/馒头/面条/粥/饼），按菜系与餐别加权；主食仍不是 Dish 记录（修订 MEAL-05）。
- [x] 27. 新增服务端 IP 定位 + 天气上下文（免 Key：ip-api.com + wttr.in），带超时、缓存与 fail-open；
       `/api/dishes/random` 返回城市、天气与「是否应用了偏好」，首页展示环境信息。

## 阶段四：AI 智能推荐（P1，二期）

> 推荐方式见新增需求 N22~N24：GLM 可换供应商、真实菜品池防幻觉、SSE 流式聊天。

- [x] 20. 实现 `/api/recommend`，基于用户自然语言拼 Prompt 调用大模型。
- [x] 21. 实现独立「智能问答」聊天页面（入口在首页「AI 帮我选」与「我的」页）。

## 阶段五：P2 完善计划（规划中）

> 现状：一期闭环已通（游客浏览 / 推荐 / 搜索 / 详情 / 收藏 / 历史 / 偏好 / AI 对话 / 后台菜品分类 / 个人资料）。
> P2 不再扩核心链路，只补「上线安全、数据闭环、运营效率、工程质量」四类缺口。
> 排期原则：P2-A 与 P2-D 是开放注册的门槛；P2-B / P2-C 按运营节奏迭代。每条落地前先在 `domain.md` 补规则编号，并在 `acceptance.md` 补验收项。

### 查漏补缺结论（本次审查）

| 类别 | 发现 | 证据 |
|------|------|------|
| 账号 | 无注销、无找回密码、邮箱不可改、无头像；`User` 没有禁用状态与最近登录时间 | `prisma/models/user.prisma`、`server/api/me/*`、AUTH-07 |
| 推荐 | 「换一个」只靠本次 `excludeIds`，刷新即忘；没有持久的「不感兴趣」；无曝光/点击/就餐转化数据 | `server/api/dishes/random.get.ts`、DISH-04 |
| 历史 | 只能写入，没有删除/撤销接口，误点「今天就吃它」无法纠正 | `server/api/history/` 仅 `index` / `today` |
| 后台 | 只有菜品与分类 CRUD，无用户管理、数据看板、操作审计、批量操作 | `app/pages/admin/`、`server/api/admin/` |
| 工程 | 无测试 / lint / format / typecheck 脚本、无 CI、无 `error.vue`、无健康检查、无限流与监控；README 仅 13 行 | `package.json`、项目根目录 |
| 文档 | `acceptance.md` 的步骤编号与本文已错位；注销 / 禁用 / 推荐反馈 / 限流尚无业务规则 | `acceptance.md`、`domain.md` |

### P2-A 上线前必须补齐（安全与账号）

> 状态标记：✅ 已落地（2026-11-10）；⏸ 暂缓。
> P2-04 找回密码已落地：邮件通道采用 Resend HTTP API（原生 fetch，不新增依赖），未配置 Key 时开发环境走日志 + `devResetUrl` 兜底（AUTH-14）。
> P2-05 邮箱修改已升级为邮件验证两步流程（AUTH-15）：确认前原邮箱仍可登录，确认后才真正换绑；未配置 Key 时开发环境返回 `devConfirmUrl`。
> 用户口径的 P2-06「手机号验证」与原计划编号不一致（原 P2-06 是会话失效机制，已完成），按新增需求 N35 实施：手机号换绑走短信验证码两步确认（AUTH-16），短信商暂未接入，开发环境返回 `devCode`。
> P2-08「用户偏好管理」按计划内语义落地为「持久化不感兴趣」（PREF-11）：新增 `DishFeedback`，首页「换一个」旁提供不感兴趣，随机与 AI 推荐统一排除 7 天内反馈过的菜；「我的 → 不感兴趣的菜」可查看并撤销。
> P2-09「用户画像与个性化推荐」按计划内语义落地为「推荐效果埋点」（TRACK-01~04）：新增 `RecommendEvent`，首页与 AI 聊天埋曝光/点击/就餐三类事件，前端批量上报、服务端 `eventId` 去重；游客也可上报（`userId` 为空），埋点失败静默不影响主流程。画像聚合与调权待后续需求另立编号。
> P2-10「用户反馈与评价」按计划内语义落地为「搜索历史与空结果兜底」（SEARCH-01~03）：菜品库本机保存最近 10 条搜索词（去重置顶、可清空）；搜索/分类无结果时展示相近分类与热门菜（近 30 天就餐 Top 6，不足用最新上架补齐），避免死胡同。
> P2-11「用户收藏与关注功能」按计划内语义落地为「后台用户管理」（AUTH-17 / ADMIN-01~03）：用户列表支持邮箱/手机号/昵称搜索、角色与状态筛选；禁用（`disabledAt`）后登录 403 且旧会话失效，可随时启用；支持重置密码与角色变更，写操作全部在同一事务内记录 `AdminAuditLog`（为 P2-13 预留）；管理员不能对自己执行禁用/改角色/重置密码。收藏与关注不在本期范围（收藏一期已完成，关注未立项）。
> P2-17 工程化落地：接入 `@nuxt/eslint` + Prettier，补齐 `lint` / `lint:fix` / `format` / `format:check` / `typecheck` 脚本；修复后台页面 Element Plus 表格插槽与弹窗表单的类型问题后，四条命令全部零错误。
> P2-19 / P2-21 落地：`GET /api/health` 真实探活数据库（3s 超时，断开 503）；请求日志中间件统一 `x-request-id` 并输出 method/path/status/耗时；Nitro error 钩子把 5xx 与堆栈写入结构化日志（不引入 Sentry，等价可追踪）；AI 推荐额外记录成功/失败与耗时用于失败率和 P95；新增 `app/error.vue` 品牌错误页，菜品卡片与详情补图片加载失败占位。
> P2-16 测试落地：接入 Vitest（`npm test`，4 个文件 23 条用例）覆盖 Zod 契约（AUTH-04 / DISH-03/05 / REC-05）、主食池加权（MEAL-05）、去重窗口优先级（DISH-05）、地域天气倍率上限（PREF-06）；`npm run test:e2e`（6 条）用 `@nuxt/test-utils` 启动真实服务验证 health、菜品列表、空搜索、401 边界、游客抽签与 404 品牌页。为可测性把地域/天气权重抽成纯函数 `server/utils/recommendBias.ts`，并导出 `resolveDedupeDays`。
> P2-18 / P2-23 落地：新增 `.github/workflows/ci.yml`（install → migrate/seed → lint → format:check → typecheck → test → e2e → build，自带 PostgreSQL 16）、三阶段 `Dockerfile`（deps / build / runner + `migrator` target）、`docker-compose.yml`（db / migrate / app / seed）、`.env.example` 与启动校验 `server/plugins/env-check.ts`。README 重写，补齐环境变量清单、三种部署方式、上线检查清单与备份恢复；新增 `scripts/backup-db.sh`（7 天保留 + sha256）与 `scripts/restore-db.sh`（必须 `CONFIRM_RESTORE=yes`）。
> P2-07 落地：新增 `DELETE /api/history/:id`（HISTORY-04），仅本人且 `eatenOn` 在最近 7 个自然日内可撤销，非本人/不存在统一 404、超期 403；历史页改为 `van-swipe-cell` 左滑撤销，二次确认后本地移除并递减总数，删空当前页会自动续拉。
> P2-12 落地：`/admin` 改为数据看板（总量、7/30 天趋势、热门菜 Top10、零结果搜索、AI 调用/失败率/平均耗时）。为可统计新增两张纯观测表：`SearchLog`（只在关键词零结果时写入）与 `AiCallLog`（推荐接口成功/失败落库）；趋势按本地日历补零，热门菜以 `DiningHistory` 为准，不依赖前端埋点。
> P2-13 落地：`AdminAuditLog` 泛化为 `targetType`（USER/DISH/CATEGORY）+ `targetId`，用户/菜品/分类的写操作全部走事务内 `recordAdminAudit`；新增只读 `GET /api/admin/audit-logs` 与 `/admin/audit-logs` 页面（目标类型筛选、时间倒序、操作人邮箱）。审计接口不提供删除/修改。
> P2-14 / P2-15 落地：后台菜品列表新增「资料完整度」筛选（缺图片/缺过敏原/缺食材）与逐行缺失标签；新增批量上下架/改分类（≤200 条、逐条审计）与 CSV 导入导出（中文表头、导出带 BOM、导入 ≤500 行且 `dryRun` 预校验并按 Excel 行号返回失败原因）。CSV 解析自实现于 `server/utils/csv.ts`，不引依赖。
> P2-20 落地：迁移 `add_query_indexes` 增加 `dishes(isPublished, deletedAt)` 与 `favorites(dishId)`；`ILIKE` 搜索的 `pg_trgm` 触发阈值（5000 行或 P95 > 300ms）与基线记录写入 `docs/domain.md` DATA-06 与 `docs/tech-stack.md`。
> P2-22 落地：新增 `usePageSeo`（标题/描述/OG，详情页跟随菜品数据）并接入全部页面；`robots.txt` / `sitemap.xml` 改为服务端路由按请求域名生成，移除会被优先命中的 `public/robots.txt`。
> P2-24 落地：`acceptance.md` 按阶段重排并连续编号，新增 P2-12/13/14/15/20/22 验收项；规则编号补 ADMIN-04~07、SEARCH-04、SEO-01~02。

| 编号 | 优先级 | 需求 | 缺口/说明 | 落点 | 验收要点 |
|------|--------|------|-----------|------|----------|
| P2-01 ✅ | 高 | 登录/注册限流 | 目前可无限撞库，无失败次数限制 | 新增 `server/utils/rateLimit.ts`（进程内滑动窗口，按 IP + 账号），接入登录/注册/找回密码 | 同 IP 1 分钟内第 6 次失败返回 429 中文提示；正常用户不被误伤；单机限流前提写进注释 |
| P2-02 ✅ | 高 | AI 调用配额与超时 | LLM 按量计费，任何人可无限调用 | `recommend.post.ts` 增加每日配额（登录用户 N 次，建议 30；游客按 IP 更低）、`max_tokens` 与 30s 超时 | 超限直接返回 SSE error 且不请求上游；慢请求 30s 内收尾 |
| P2-03 ✅ | 高 | 账号注销 | `deletedAt` 已具备，但没有入口与接口 | 新增 `DELETE /api/me`：软删除 + `clearUserSession`；注销确认文案写明「邮箱/手机号不可再注册」（DATA-03） | 注销后旧凭证登录失败、资料接口 401；邮箱仍被占用；收藏与历史按 DATA-02 保留 |
| P2-04 ✅ | 高 | 找回密码 | 忘记密码只能联系管理员；项目暂无邮件服务 | 新增 `POST /api/auth/forgot-password` + `POST /api/auth/reset-password`：32 字节随机 token 只存 SHA-256 哈希，15 分钟、单次有效；邮件走 Resend HTTP API，未配置时开发环境返回 `devResetUrl`（AUTH-14） | token 过期/复用返回 400；新密码可登录、旧密码失效；重置后旧会话全部 401 |
| P2-05 ✅ | 中 | 邮箱修改（邮件验证） | AUTH-07 明确本期不开放，但用户换邮箱只能重新注册 | 两步换绑（AUTH-15）：`PATCH /api/me/profile` 校验当前密码 + 全局唯一（含软删除占用，DATA-03）后只写 `pendingEmail` 并发确认邮件（30 分钟、单次有效、按用户限流）；新增 `POST /api/auth/confirm-email` 与 `/confirm-email` 确认页，确认后才写入 `email` 并清 pending | 当前密码错误 400；占用 409；确认前原邮箱仍可登录、新邮箱不可；确认后新邮箱可登录、旧邮箱失效；token 复用/过期 400；10 分钟内第 6 次申请 429 |
| P2-06 ✅ | 中 | 统一会话失效机制 | 禁用/注销后其他设备会话仍可存活至 7 天（AUTH-05）；目前无法主动踢下线 | `User` 增加 `sessionVersion`，登录写入会话，鉴权工具比对版本；管理员禁用、注销、改密时自增（AUTH-12） | 禁用/注销后其他设备下一次请求即 401；改密后旧会话失效（与 AUTH-09 一致） |

### P2-B 数据闭环与推荐质量

| 编号 | 优先级 | 需求 | 缺口/说明 | 落点 | 验收要点 |
|------|--------|------|-----------|------|----------|
| P2-07 ✅ | 高 | 就餐历史撤销 | 误点「今天就吃它」无法纠正，还会影响去重 | 新增 `DELETE /api/history/[id]`（仅本人、限 7 天内）；历史页提供左滑/长按删除 | 删除后列表与统计立即更新；推荐不再排除该菜；越权删除返回 403/404 |
| P2-08 ✅ | 中 | 持久化「不感兴趣」 | 只有本次 `excludeIds`，刷新后同一道菜会再次出现 | 新增 `DishFeedback`（`userId + dishId + action` 唯一）；「换一个」旁加「不感兴趣」，随机推荐与 AI 候选统一硬排除 7 天内反馈过的菜；规则补为 PREF-11 | 反馈后 7 天内不再推荐该菜；「我的」可查看并撤销反馈 |
| P2-09 ✅ | 中 | 推荐效果埋点 | 无法回答「推荐多少次、点开多少、真正吃了几次」 | 新增 `RecommendEvent`（impression/click/dine、dishId、来源、时间、前端唯一 `eventId`）；前端 2s 防抖/满 20 条批量上报，接口 Zod 校验并按 `eventId` 去重 | 后台可算曝光→点击→就餐转化率；埋点失败不影响主流程 |
| P2-10 ✅ | 中 | 搜索历史与空结果兜底 | 无搜索历史；搜不到时只有空态 | 菜品库页 localStorage 保存最近 10 条搜索词（防抖后记录、去重置顶、可清空）；无结果时展示相近分类与热门菜（近 30 天就餐 Top 6，不足用最新上架补齐） | 历史可清空且不跨设备；空结果页有可点击兜底，不出现死胡同 |

### P2-C 管理后台与运营

| 编号 | 优先级 | 需求 | 缺口/说明 | 落点 | 验收要点 |
|------|--------|------|-----------|------|----------|
| P2-11 ✅ | 高 | 用户管理 | 后台只能管菜品与分类，用户无法禁用或重置密码 | `app/pages/admin/users.vue` + `/api/admin/users`：搜索、角色筛选、禁用/启用（`disabledAt`）、重置密码、角色变更；依赖 P2-06 | 禁用后登录 403 且旧会话失效；重置密码有二次确认并记录审计；管理员不能禁用自己 |
| P2-12 ✅ | 中 | 数据看板 | 没有任何运营数据入口 | 后台首页改为看板：用户/菜品/收藏/历史总量、7/30 天趋势、热门菜 Top10、零结果搜索、AI 调用与失败率；新增 `SearchLog`（零结果留痕）与 `AiCallLog`（替代只能看 stdout 的日志指标） | 数据与数据库一致；支持 7/30 天切换；无数据时展示空态 |
| P2-13 ✅ | 中 | 操作审计 | 后台删除/改角色等操作不可追溯 | 复用并泛化 `AdminAuditLog`：增加 `targetType`（USER/DISH/CATEGORY）与 `targetId`，用户/菜品/分类的写操作统一记录；新增只读查询 `GET /api/admin/audit-logs` 与 `/admin/audit-logs` 页面 | 可查询最近操作；删除菜品、禁用用户、重置密码均能追溯到人 |
| P2-14 ✅ | 中 | 菜品质量巡检 | 缺图、缺过敏原、缺食材会影响推荐与展示，目前靠人工发现 | 后台增加「资料完整度」筛选：缺图片 / 缺过敏原 / 缺食材（不提供「无分类」：DISH-01 要求分类必填）；列表新增完整度标签，补全后保存即移出清单 | 筛选数量与数据库一致；补全后自动移出清单 |
| P2-15 ✅ | 低 | 批量与导入导出 | 菜品只能逐条维护，初始化与迁移成本高 | 批量上下架、批量改分类（≤200 条，逐条审计）、CSV 导入导出（自实现 `server/utils/csv.ts`；导入 ≤500 行、`dryRun` 预校验、失败行返回 Excel 行号） | 导入非法行不落库并有错误报告；批量操作有确认与审计 |

### P2-D 工程化与可靠性

| 编号 | 优先级 | 需求 | 缺口/说明 | 落点 | 验收要点 |
|------|--------|------|-----------|------|----------|
| P2-16 ✅ | 高 | 测试体系 | 项目零测试，改推荐/权限逻辑只能靠手测 | Vitest（schemas、`shared/utils`、权重与过滤、接口集成）+ Playwright（登录、推荐、收藏、资料、后台 CRUD） | 核心链路有自动化用例；CI 中全绿 |
| P2-17 ✅ | 高 | Lint / 格式化 / 类型检查 | 无 ESLint、Prettier、`typecheck` 脚本，`.vue` 类型错误无法在提交前发现 | 接入 `@nuxt/eslint` + Prettier，补 `lint` / `format` / `typecheck` 脚本 | `npm run lint`、`npm run typecheck` 零错误；CI 强制 |
| P2-18 ✅ | 高 | CI/CD 与部署 | 无 CI、无 Dockerfile、README 只有本地启动片段 | GitHub Actions（install → lint → typecheck → test → build）；Dockerfile + 部署章节 + 环境变量清单校验 | 主分支合并前必须通过 CI；按文档可从零部署 |
| P2-19 ✅ | 高 | 健康检查与可观测性 | 无 `/api/health`、无结构化日志、无错误上报 | `GET /api/health`（DB 探活）；请求日志带 requestId/耗时/状态；错误上报（Sentry 或等价）；监控 LLM 失败率与 P95 | 数据库断开时 health 返回 503；线上错误可按 requestId 追踪 |
| P2-20 ✅ | 中 | 性能与索引 | 搜索走 `ILIKE` 无索引；`favorites` 只有 `userId` 索引，按菜品统计收藏数会全表扫；无性能基线 | 补 `dishes(isPublished, deletedAt)`、`favorites(dishId)`（迁移 `add_query_indexes`）；`pg_trgm` 触发阈值与压测基线写入 `domain.md` DATA-06 与 `tech-stack.md` | 索引已落库并通过 EXPLAIN 验证；基线数据与触发条件有记录 |
| P2-21 ✅ | 中 | 统一错误页与空态 | 无 `app/error.vue`；接口失败提示不统一 | 增加 404/500 品牌错误页；接口错误统一 toast + 重试；图片加载失败占位 | 任意不存在路由显示品牌 404；断网提交有明确提示 |
| P2-22 ✅ | 低 | SEO 与分享 | 所有页面无 `useHead`，无标题/描述/OG | 新增 `usePageSeo` 统一标题/描述/OG（详情页跟随菜品），全部页面接入；`robots.txt` / `sitemap.xml` 改为服务端路由按域名生成 | 分享链接有正确标题与封面；搜索引擎可抓取 |
| P2-23 ✅ | 中 | 备份与迁移纪律 | 无备份与恢复流程 | 每日数据库备份 + 恢复演练脚本；迁移只前进不回滚，流程写入 README | 能按文档从备份恢复；迁移失败有回退预案 |
| P2-24 ✅ | 低 | 文档与验收对齐 | `acceptance.md` 步骤编号与本文已错位，P2 规则尚无编号 | 按阶段重排验收表并连续编号；补 ADMIN-04~07 / SEARCH-04 / SEO-01~02 规则编号 | 计划步骤与验收项一一对应，不再靠编号猜测 |

### P2-E 明确不做（防止范围膨胀）

- 对象存储与 CDN：菜品图改为本地磁盘上传（DISH-07），仍不接 S3/OSS；多实例部署前需改成共享存储。
- 头像上传：DISH-07 的上传只服务菜品图，用户头像仍不做。
- 拼音首字母搜索：DISH-03 已明确禁止。
- 评分、评论、社交关系：审核与运营成本高，无明确需求不立项。
- 在线支付 / 会员 / 多语言：与「吃啥饭」核心目标无关。
- PWA、离线、消息推送、收藏备注：等有留存数据或明确用户反馈后再评估，避免提前加字段（DATA-05）。

### P2 启动门槛

1. P2-A 全部完成，且 P2-D 的测试、CI、健康检查落地后，才对外开放注册。
2. P2-B / P2-C 每项必须先补 `domain.md` 规则编号与 `acceptance.md` 验收项，再进入开发。
3. 依赖顺序：P2-06 → P2-03 / P2-11；P2-09 → P2-12；P2-16 / P2-17 → P2-18。
