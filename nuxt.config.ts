// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },

  // 模块注册顺序即加载顺序。Vant 与 Element Plus 都依赖组件自动导入，
  // 两者组件前缀不同（VanButton / ElButton），可以共存，但禁止在同一页面混用样式。
  modules: ['@pinia/nuxt', '@vant/nuxt', '@element-plus/nuxt', 'nuxt-auth-utils', '@nuxt/eslint'],

  // eslint 模块只负责生成 .nuxt/eslint.config.mjs 供 eslint.config.mjs 复用，
  // 不开启 stylistic（格式化交给 Prettier），避免两套规则互相打架。
  eslint: {
    config: {
      stylistic: false,
    },
  },

  // 全局样式只在这一处引入，组件内不要再 import，避免样式重复打包。
  css: ['~/assets/styles/main.scss'],

  // 开发服务器默认只监听 localhost，同一局域网的手机无法用本机内网 IP 打开。
  // 监听 0.0.0.0 表示接受所有网卡的连接，手机访问 http://<本机IPv4>:3000 即可；
  // 只在 `nuxt dev` 生效，不影响 build/preview 的产物。
  devServer: {
    host: '0.0.0.0',
    port: 3000,
  },

  // 会话 Cookie 默认带 Secure 标记（h3 的 useSession 默认值）。浏览器只允许在 HTTPS
  // 或 localhost 这种「安全上下文」里写入 Secure Cookie，手机用 http://<内网IP>:3000
  // 访问时会直接丢弃它，表现为「登录接口返回成功，但页面仍然是未登录」。
  // 所以只在开发环境关闭 Secure；NODE_ENV=production 时保持默认 true，线上必须走 HTTPS。
  runtimeConfig: {
    session: {
      cookie: {
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
})
