// server/api/auth/logout.post.ts
// 登出：清空 session。nuxt-auth-utils 会自动清除 session cookie。

export default defineEventHandler(async (event) => {
  await clearUserSession(event)
  return { ok: true }
})
