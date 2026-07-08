// eslint.config.js
import antfu from '@antfu/eslint-config'

export default antfu({
  // 自动检测 .vue, .ts, .js 等
  formatters: true,      // 开启 Prettier 格式化支持
  vue: true,             // 启用 Vue 规则
  typescript: true,      // 启用 TypeScript 规则
  ignores: [
    '**/dist/**',
    '**/.output/**',
    '**/.nuxt/**',
    '**/node_modules/**',
  ]
})