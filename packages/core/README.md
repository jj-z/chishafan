# @chisha/core

> 吃啥饭项目的共享核心逻辑包。所有与平台无关的纯逻辑、类型、状态管理、工具函数均存放于此。
> Web、小程序、SSR 三端共享，禁止任何平台特有 API 进入。

---

## 一、为什么需要统一的类型定义？

前后端各自定义业务实体，极易出现字段不一致（如 `calories` vs `calorie`），导致编译期不报错、运行时崩溃。

在 `core` 中统一定义所有实体类型，全项目引用同一个标准：
- 修改字段时，所有引用处同时报错，强制同步修正。
- 前后端共享类型文件，接口联调零歧义。

**这是类型安全的核心价值：一次定义，全局校验。**

---

## 二、`core` 包应该放什么？

| 类别 | 说明 | 示例 |
|:---|:---|:---|
| **类型定义** | 所有业务实体的 TS 接口 | `Dish`, `User`, `Category`, `Favorite` |
| **Composables** | 无 DOM 操作的纯逻辑组合式函数 | `useRandomDish`, `useFilter`, `useFavorite` |
| **Pinia Stores** | 需要多端共享的全局状态 | `useUserStore`（用户偏好、token） |
| **工具函数** | 纯计算、格式化、校验等 | `formatCalories`, `getMealTimeLabel` |
| **API 客户端** | 封装请求方法（平台无关的接口层） | `createApiClient(requestFn)` |
| **常量/枚举** | 业务状态值、标签 | `MEAL_TIMES`, `DIFFICULTY_LEVELS` |

### 重点说明

#### 1. Composable（组合式函数）
如 `useRandomDish`，接收数据，返回随机结果和刷新方法。  
**在网页、小程序、SSR 中行为完全一致 → 必须放入 core。**

#### 2. API 客户端
各平台请求方法不同（`fetch` / `uni.request` / `$fetch`），  
设计一个工厂函数接收“平台特定的请求方法”，返回统一接口对象：
```ts
// 核心思想
function createApiClient(requestFn) {
  return {
    getRandomDish: (mealTime) => requestFn(`/api/dishes/random?mealTime=${mealTime}`),
    addFavorite: (dishId) => requestFn('/api/favorites', { method: 'POST', body: { dishId } }),
  }
}
```

## 三、代码铁律（务必遵守）

✅ 可以使用 Vue 的 `ref`、`reactive`、`computed`

✅ 可以使用 Pinia 的 `defineStore`

✅ 可以使用 `Date`、`Math`、抽象后的请求函数

❌ 严禁出现 `window`、`document`、`localStorage`

❌ 严禁出现 `wx`、`uni`、`process.client`

❌ 严禁直接操作 DOM

原因：core 会在 Node 服务端（SSR）执行，不存在浏览器环境。

## 四、当前任务清单

- 完善 `Dish` 类型，包含所有字段（菜名、餐时、菜系、口味、食材、致敏物、卡路里、价格、难度、时长等）
- 添加 `MEAL_TIMES` 常量数组
- 改造 `useRandomDish`，支持接收可选的 `mealTime` 过滤
- 在 `web-vue3` 中实际引入，验证类型和逻辑复用是否正常
- 后续逐步迁移更多纯逻辑 `composable` 和 `store` 至此包

## 五、目录结构参考（仅限 `core`）

实际 `src` 目录包含 4 个子目录（以下内容已与代码目录对齐）：

```text
core/
├── package.json            # 包元信息与对外导出
├── README.md               # 本说明（维护规范/约束）
└── src/
  ├── composables/       # 无平台依赖的组合式函数（useRandomDish 等）
  ├── constants/         # 常量与枚举（MEAL_TIMES、标签等）
  ├── stores/            # Pinia store（平台可用的抽象状态）
  ├── types/             # 业务实体类型（Dish, User, Category...）
  └── index.ts           # 统一对外导出（entry）
```

建议约定：
- `types`：仅放类型定义，避免引入运行时代码；字段变更需同步至引用处。
- `composables`：仅包含纯逻辑（可使用 Vue 的响应式 API），不得直接访问浏览器或平台全局对象。
- `constants`：集中管理业务常量/枚举，便于多端共享。
- `stores`：放置 Pinia store，实现状态抽象并保持与平台层解耦。

本文件为 `@chisha/core` 的维护规范，随项目进化持续更新。


