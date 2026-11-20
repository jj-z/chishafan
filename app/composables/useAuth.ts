// app/composables/useAuth.ts
// 用户端认证统一入口：登录 / 注册 / 退出，以及「未登录时跳登录页并保留原地址」。
// 登录态本体由 nuxt-auth-utils 的 useUserSession 提供（cookie 会话，无需手动存 token）。

import { authOkSchema, type loginBodySchema, type registerBodySchema } from '#shared/schemas/auth'
import type { z } from 'zod'

type LoginBody = z.infer<typeof loginBodySchema>
type RegisterBody = z.infer<typeof registerBodySchema>

export function useAuth() {
  const session = useUserSession()
  const route = useRoute()
  const router = useRouter()

  /**
   * 登录。成功后调 session.fetch() 让前端拿到服务端种下的 cookie 会话；
   * 之后页面里 session.loggedIn / session.user 自动更新。
   */
  async function login(body: LoginBody) {
    await apiFetch('/api/auth/login', authOkSchema, { method: 'POST', body })
    await session.fetch()
  }

  /** 注册。后端注册即登录（AUTH-04），同样只需 fetch 一次会话。 */
  async function register(body: RegisterBody) {
    await apiFetch('/api/auth/register', authOkSchema, { method: 'POST', body })
    await session.fetch()
  }

  /**
   * 退出登录。清空会话后跳到指定页面：用户端回首页，管理端回登录页
   * —— 管理端退出后落到客户端首页会让人以为「已经切到用户端」，也容易误操作。
   */
  async function logout(redirectTo = '/') {
    await $fetch('/api/auth/logout', { method: 'POST' })
    await session.fetch()
    router.replace(redirectTo)
  }

  /**
   * 需要登录才能进行的操作（收藏、就吃它）的守卫。
   * 未登录时弹提示并带 redirect 去登录页，登录成功后回到当前页面继续操作。
   */
  function requireLogin(): boolean {
    if (session.loggedIn.value) return true
    showToast('请先登录')
    router.push({ path: '/login', query: { redirect: route.fullPath } })
    return false
  }

  return { session, login, register, logout, requireLogin }
}

/** 供 loginBodySchema 的类型单独导出，表单组件校验或提交前使用。 */
export type { LoginBody, RegisterBody }
