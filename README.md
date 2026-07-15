# 🍚 吃啥饭 (What to Eat)

> 一个解决“今天吃什么”的全栈多端应用。  
> **网页、小程序、App 全覆盖，独立完成前后端与部署。**

🌐 在线体验：[https://chisha.vercel.app](https://chisha.vercel.app)  
📦 代码仓库：[https://gitee.com/你的用户名/chisha](https://gitee.com/你的用户名/chisha)

---

## ✨ 核心功能

- 🎲 **随机推荐**：打开即得一道菜，不满意点“换一个”
- 📂 **分类筛选**：按川菜、粤菜、西餐等菜系浏览
- ⭐ **个人收藏**：用户注册登录后，收藏喜欢的菜品
- 🔍 **智能搜索**：按菜名快速查找
- 🛠️ **管理后台**：管理员增删改查菜品和分类

---

## 🧱 技术架构（Monorepo）

采用 `pnpm workspace` 统一管理，一套核心逻辑，多端复用。

chisha/
├── packages/
│   ├── core/            # 共享核心逻辑：公共类型、组合式函数、API 规范
│   ├── mock/            # Mock 数据与接口，实现前端独立开发
│   ├── web-vue3/        # Vue 3 SPA 版，Vite + TypeScript + Vant
│   │   ├── public/      # 静态资源
│   │   ├── src/         # 源代码入口
│   │   ├── tsconfig.*   # TypeScript 配置
│   │   └── vite.config.ts
│   ├── web-nuxt/        # Nuxt 3 SSR 版，服务端渲染与静态页面
│   └── miniapp-uniapp/  # uni-app 小程序 / App 多端版
├── server/              # Express API 服务端
├── docs/                # 项目文档：需求、设计、作品集说明
├── pnpm-workspace.yaml  # pnpm workspace 配置
├── package.json         # 根脚本与依赖管理
├── eslint.config.js     # 统一 ESLint 配置
└── README.md            # 项目说明文档


### 技术栈详解

| 层级 | 技术 |
|:---|:---|
| 网页 SSR | Nuxt 3、Vue 3、TypeScript |
| 网页 SPA | Vue 3、Vite、TypeScript |
| 小程序/App | uni-app (Vue 3) |
| 后端 API | Express、TypeScript、JWT 认证 |
| 数据库 | Prisma、SQLite（开发）/ PostgreSQL（生产） |
| 工程化 | pnpm workspace、ESLint |

---

## 🚀 本地运行

确保已安装 Node.js 18+ 和 pnpm。

```bash
# 1. 克隆项目
git clone https://gitee.com/你的用户名/chisha.git
cd chisha

# 2. 安装依赖
pnpm install

# 3. 启动 Vue3 SPA 版
pnpm dev:vue3

# 4. 启动后端（另一个终端）
pnpm dev:server

# 5. 启动 Nuxt SSR 版（阶段三）
pnpm dev:web

---

**项目目录说明（简要）**

- `packages/core`：共享核心包，放置纯逻辑、类型、可复用 composable、以及平台无关的 API 客户端工厂。
- `packages/mock`：本地 mock 服务与示例数据，用于前端在无真实后端时的独立开发与集成测试。
- `packages/web-vue3`：基于 Vue 3 + TS 的 SPA 实现，适合单页应用部署场景。
- `packages/web-nuxt`：基于 Nuxt 3 的 SSR 实现，用于 SEO 与首屏性能优化。
- `packages/miniapp-uniapp`：使用 uni-app 实现的小程序及原生打包目标（多端兼容）。
- `server`：后端代码（Express + TypeScript），包含路由、中间件、Prisma 数据模型与迁移脚本。
- `docs`：项目的需求、设计与作品集说明，作为项目知识库和简历素材来源。

若需贡献：请先阅读 [packages/core/README.md](packages/core/README.md#L1) 以了解核心包的约束与设计原则。

