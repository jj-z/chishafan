// app/middleware/auth.global.ts
// Nuxt 4 全局路由中间件必须放在 app/middleware/。
// /admin/* 要求 ADMIN；/app/* 要求登录；其余页面对游客开放。

const ADMIN_PREFIX = '/admin'
const APP_PREFIX = '/app'
const LOGIN_PATH = '/login'

export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn, user } = useUserSession()

  if (to.path.startsWith(ADMIN_PREFIX)) {
    if (!loggedIn.value) {
      return navigateTo({ path: LOGIN_PATH, query: { redirect: to.fullPath } })
    }
    if (user.value?.role !== 'ADMIN') {
      throw createError({ statusCode: 403, statusMessage: '需要管理员权限' })
    }
  }

  if (to.path.startsWith(APP_PREFIX) && !loggedIn.value) {
    return navigateTo({ path: LOGIN_PATH, query: { redirect: to.fullPath } })
  }
})
