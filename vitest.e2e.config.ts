// 接口集成测试配置（P2-16）。
// 启动真实 Nuxt 服务并连接 DATABASE_URL 指向的数据库，因此：
// 1. 本机跑之前先 `npm run dev` 之外的准备（migrate + seed）需已完成；
// 2. CI 中由 GitHub Actions 提供 PostgreSQL 服务并执行 migrate/seed（见 P2-18）。

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.spec.ts'],
    // 首次启动 Nuxt 需要构建/预热，放宽超时；用例本身都很短。
    // hookTimeout 覆盖 setup() 启动 dev server 的耗时：Windows 冷启动可达 3~4 分钟，
    // 两个 e2e 文件会各自启动一次，180s 不够会被判成「Hook timed out」而不是用例失败。
    testTimeout: 180_000,
    hookTimeout: 600_000,
    // 多个 e2e 文件共用一个服务实例代价高，串行执行更稳定。
    fileParallelism: false,
  },
})
