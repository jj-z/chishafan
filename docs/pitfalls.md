# 踩坑记录 (Pitfalls)

本文件记录我们在开发过程中遇到的“反直觉”问题及解决办法。AI 生成代码时若涉及相关区域，应避开这些坑。

## 1. Nuxt 服务端状态泄漏
- **现象**：用户 A 看到了用户 B 的收藏列表。
- **原因**：在模块顶层定义了 `const favorites = ref([])`。
- **解决**：服务端的共享状态必须用 `useState('key', () => [])` 或放入 Pinia，确保请求级别隔离。

## 2. Prisma 热更新导致连接数耗尽
- **现象**：本地开发频繁刷新页面，数据库报 `too many connections`。
- **原因**：每次代码更新，Nuxt 重新执行模块，导致不断 `new PrismaClient()`。
- **解决**：`server/utils/db.ts` 必须使用 `globalThis` 缓存 Prisma 实例。

## 3. 客户端水合不匹配 (Hydration Mismatch)
- **现象**：浏览器控制台报 `Hydration node mismatch`。
- **原因**：在模板里直接使用了 `Date.now()` 或 `window` 对象。
- **解决**：涉及浏览器特有 API 的逻辑，必须在 `onMounted` 中执行，或用 `<ClientOnly>` 包裹。

## 4. Nuxt 4 中间件目录是 `app/middleware/` 而不是根 `middleware/`
- **现象**：在项目根目录建 `middleware/auth.global.ts`，路由守卫完全不生效。
- **原因**：Nuxt 4 将应用层代码统一收到 `app/` 目录（约定式目录迁移），根目录 `middleware/` 已不再被扫描。
- **解决**：把全局中间件放到 `app/middleware/`；`server/` 与 `app/` 的代码分离原则同理。

## 5. `#auth-utils` 类型扩展必须用模块声明文件
- **现象**：`useUserSession().user.role` 类型报错或提示 user 是 `Record<string, unknown>`。
- **原因**：nuxt-auth-utils 通过 `#auth-utils` 虚拟模块注入类型，需要用全局 `declare module` 扩展，而不是 `import type`。
- **解决**：建 `shared/types/auth.d.ts`，内写 `declare module '#auth-utils' { interface User { ... } }` 再 `export {}`。放在 `shared/` 下，Nuxt 会自动纳入 tsconfig。

## 6. Prisma 7 的 `db execute` 不再接受 `--schema`
- **现象**：`prisma db execute --schema prisma --stdin` 报 `unknown or unexpected option: --schema`。
- **原因**：Prisma 7 把数据源读取迁移到 `prisma.config.ts`，CLI 只接受 `--config` 指定配置文件。
- **解决**：直接用 `npx prisma db execute --stdin`（或 `--file`），从 `prisma.config.ts` 自动读取连接。

## 7. `ENOTEMPTY` 构建失败（Windows 残留产物）
- **现象**：`nuxt build` 在 Nitro 阶段报 `ENOTEMPTY: directory not empty, rmdir '.output/server/node_modules/pg-types/node_modules'`。
- **原因**：上一次构建被中断时 `.output` 留下嵌套 node_modules，Windows 下 Vite 无法直接删除。
- **解决**：删除整个 `.output` 目录后重新构建。

## 8. Vant `van-form` 不能使用 `@submit.prevent`
- **现象**：提交登录或注册表单时报 `TypeError: e.preventDefault is not a function`。
- **原因**：Vue 的 `.prevent` 修饰符会把组件 `submit` 事件的第一个参数当成 DOM Event，但 Vant 传入的第一个参数是校验后的表单值对象。
- **解决**：使用 `@submit="handleSubmit"`，由 Vant Form 自己阻止原生表单提交，不添加 `.prevent`。

## 9. `@db.Date` 写入时区偏移一天
- **现象**：`DiningHistory.eatenOn` 用 `new Date(y, m, d)`（本地零点）写入后，东八区查出来变成昨天。
- **原因**：PostgreSQL 的 `date` 列没有时区，Prisma 会按 **UTC** 截取日期。本地零点（UTC+8）实际是前一天 16:00Z，入库就少了一天。
- **解决**：统一使用 `server/utils/date.ts` 的 `todayDateOnly()`（取本地年月日 → 构造成 UTC 零点）写入；读取用 `toDateOnlyString()` 转 `YYYY-MM-DD`。禁止在接口里手写 `new Date(y, m, d)` 往 `@db.Date` 字段写值。

## 10. Windows 下 Nuxt 集成测试产物模式 teardown 报 `EEXIST` / `ENOTEMPTY`
- **现象**：`@nuxt/test-utils` 的 `setup({ server: true })` 构建 Nitro 产物后，Windows 下创建 `output/server/node_modules` 包软链，teardown 偶发 `EEXIST: file already exists, symlink ...` 或 `ENOTEMPTY`，表现为「用例全过但退出码 1」。
- **原因**：Nitro 的包软链在 Windows 上无法稳定覆盖/删除，与用例本身无关。
- **解决**：e2e 改为 `setup({ dev: true, server: true })`，跳过产物打包；构建验证交给单独的 `npm run build`。禁止 `try/catch` 吞掉 teardown 异常或手工删 `.nuxt/test` 当作修复。

## 11. vue-tsc 把 `reactive<T>()` 误判成 Ref
- **现象**：后台弹窗表单写成 `const form = reactive<DishForm>(...)`，模板里部分 `v-model="form.xxx"` 报 `Property 'value' does not exist on type ...`。
- **原因**：vue-tsc 对显式泛型 `reactive` 调用的模板解包存在误判，把绑定当成 Ref 后自动补 `.value`。
- **解决**：表单状态统一用 `ref<FormType>()` + 脚本内 `form.value.xxx`，模板保持 `form.xxx`；禁止把字段改成 `any` 绕过。Element Plus 表格插槽的 `row` 是 `DefaultRow`，传参前用 `row as AdminDish` 收窄。

## 12. 单测 import 服务端模块会把 Prisma 连接拖进来
- **现象**：想测推荐权重却 import `server/utils/recommend.ts`，结果连带 `preference.ts → db.ts` 构造 Prisma 客户端，单测变慢甚至依赖 `DATABASE_URL`。
- **原因**：权重逻辑和「读用户偏好」耦合在同一个模块。
- **解决**：纯逻辑拆到无副作用模块（如 `server/utils/recommendBias.ts`），测试直接 import 纯模块；禁止为了提高可测性去 mock 整个 prisma 单例。

## 13. 服务端不能用 `import x from './a.md?raw'`
- **现象**：`nuxt build` 时 Nitro 报 `Could not load .../server/skills/x.md?raw: ENOENT`，而本地 dev 可能正常。
- **原因**：`?raw` 是 Vite 的转换，Nitro 的服务端构建走 Rollup，会把 `?raw` 当成文件名的一部分直接读盘。
- **解决**：需要给服务端提供静态文本时，放到 `server/assets/` 下用 `useStorage('assets:server')` 读取（见 `server/utils/skills.ts`）；禁止在 `server/` 内使用 `?raw`。

## 14. pgvector 扩展不是官方镜像自带的
- **现象**：`prisma migrate deploy` 报 `extension "vector" is not available`，迁移被记为失败。
- **原因**：`postgres:16-alpine` 不含 pgvector；扩展必须安装在数据库所在主机上。
- **解决**：db 镜像改用 `pgvector/pgvector:pg16`（数据卷兼容），CI 与本机同样要换。迁移失败后用 `prisma migrate resolve --rolled-back <name>` 清掉失败记录再重试；**不要**手动改 `_prisma_migrations` 表。

## 15. 工具返回值里写「请告诉用户…」会被模型原样复述
- **现象**：AI 气泡里出现「当前条件下没有可推荐的菜，请如实告知用户，不要编造」这类内部说明，用户以为这是回答。
- **原因**：tool message 与 system prompt 都会进入模型上下文，祈使句会被当成可引用文本照抄。
- **解决**：工具只返回**事实数据**（`{ ok:false }` / `found:false`），拒答文案由服务端在 `result` 前固定生成；另外拦截「我需要调用工具」这类过程性描述（见 `recommend.post.ts` 的 meta-talk 兜底）。禁止在工具返回值里写面向模型的指令。

## 16. 未执行迁移的库上 raw SQL 直接 cast 新枚举值会 22P02
- **现象**：`/api/dishes/random` 500，日志为 `对于枚举"DishFeedbackAction"的输入值无效: "LIKE"`。
- **原因**：代码已引用新枚举值，但目标库还没执行对应迁移；PostgreSQL 在解析 `'LIKE'::"DishFeedbackAction"` 时直接报错。
- **解决**：只做比较时用 `f."action"::text = 'LIKE'`，迁移前后都能工作；需要真正写入枚举值的能力时，必须先执行迁移。