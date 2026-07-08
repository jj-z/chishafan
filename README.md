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
│   ├── core/            # 共享核心
│   ├── web-vue3/        # Vue 3 SPA 版
│   ├── web-nuxt/        # Nuxt 3 SSR 版
│   └── miniapp-uniapp/  # uni-app 多端版
├── server/              # Express API
├── pnpm-workspace.yaml
└── README.md


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

