// eslint.config.mjs
// 复用 @nuxt/eslint 在 `nuxt prepare` 时生成的配置（含 Vue / TypeScript / Nuxt 约定规则），
// 只在这里追加项目级忽略项。格式化交给 Prettier，eslint 不参与缩进/引号等风格判定。
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    ignores: [
      'prisma/generated/**',
      'shared/generated/**',
      '.output/**',
      '.data/**',
      '.screenshots/**',
      'public/**',
    ],
  },
  {
    rules: {
      // 允许以下划线开头的变量/参数不参与使用（例如接口签名占位、事件对象占位）。
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Prisma 生成的类型、Nuxt 自动导入的全局函数会产生误报，交给 typecheck 兜底。
      '@typescript-eslint/no-explicit-any': 'warn',
      // Prettier 会把 `<input />` 统一成自闭合写法，若沿用 vue 默认的 void: 'never'
      // 会导致 `format` 与 `lint` 互相覆盖（改一处立刻被另一条命令报错）。
      // 这里放开 HTML 空元素的自闭合限制，其余元素仍要求自闭合。
      'vue/html-self-closing': [
        'error',
        { html: { void: 'any', normal: 'always', component: 'always' } },
      ],
    },
  },
)
