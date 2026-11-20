// 单元测试配置（P2-16）。
// 只跑纯逻辑：shared 契约/工具、推荐权重与去重天数；不启动 Nuxt、不连数据库。
// 需要真实服务的用例放在 tests/e2e，由 vitest.e2e.config.ts 单独跑。

import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // Nuxt 的 #shared 别名在裸 Vitest 里不存在，这里补一份，保证被测模块的 import 能解析。
      '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.spec.ts'],
    reporters: 'default',
  },
})
