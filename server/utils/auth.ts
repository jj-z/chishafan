// server/utils/auth.ts
// 统一的登录态校验入口（AUTH-02 / AUTH-12）。
// 业务接口用 requireActiveUser，管理后台接口用 requireAdmin，两者都禁止绕开这里
// 直接调 requireUserSession —— 否则已注销账号与已失效的老会话仍能访问。

import type { H3Event } from 'h3'

/** 会话与数据库比对后的用户信息。 */
export interface ActiveUser {
  id: string
  email: string
  nickname: string | null
  role: 'USER' | 'ADMIN'
  sessionVersion: number
}

/**
 * 要求当前请求已登录、账号未注销，且会话版本与数据库一致。
 *
 * 为什么需要版本比对：cookie 会话默认 7 天有效（AUTH-05），改密或注销后
 * 其他设备手里的旧 cookie 仍能在有效期内继续使用。登录时把 sessionVersion
 * 写进会话，改密/注销时数据库自增，下一次请求版本不一致即 401。
 *
 * 旧 cookie 可能没有 sessionVersion 字段（升级前签发），按 0 处理，
 * 与数据库默认值一致，避免上线瞬间把所有已登录用户踢下线。
 */
export async function requireActiveUser(event: H3Event): Promise<ActiveUser> {
  const { user } = await requireUserSession(event, { status: 401, message: '未登录' })

  const dbUser = await prisma.user.findFirst({
    where: { id: user.id, deletedAt: null },
    select: {
      id: true,
      email: true,
      nickname: true,
      role: true,
      sessionVersion: true,
      disabledAt: true,
    },
  })
  if (!dbUser) {
    throw createError({ statusCode: 401, statusMessage: '账号已注销，请重新登录' })
  }
  // 先比会话版本再判禁用：禁用时服务端会自增 sessionVersion（AUTH-17），
  // 已签发会话因此返回 401；版本一致却仍被禁用说明是异常数据，返回 403 作为兜底。
  if ((user.sessionVersion ?? 0) !== dbUser.sessionVersion) {
    throw createError({ statusCode: 401, statusMessage: '登录状态已失效，请重新登录' })
  }
  if (dbUser.disabledAt) {
    throw createError({ statusCode: 403, statusMessage: '账号已被禁用，请联系管理员' })
  }
  return {
    id: dbUser.id,
    email: dbUser.email,
    nickname: dbUser.nickname,
    role: dbUser.role,
    sessionVersion: dbUser.sessionVersion,
  }
}

/**
 * 可选登录：未登录返回 null；已登录但会话已失效（改密/注销）也返回 null。
 *
 * 为什么需要它：随机推荐与 AI 推荐对游客开放，不能用 requireActiveUser（未登录会 401），
 * 但也不能直接信 getUserSession —— 改密或注销后旧 cookie 在有效期内仍然存在，
 * 若继续沿用里面的 userId，就会用已失效的会话读取该账号的偏好/历史并消耗账号配额。
 * 这类公开接口统一「失效会话按游客处理」：不报错，也不沿用旧身份。
 */
export async function getOptionalActiveUser(event: H3Event): Promise<ActiveUser | null> {
  const session = await getUserSession(event)
  if (!session.user?.id) return null

  const dbUser = await prisma.user.findFirst({
    // 禁用账号在公开接口上一律按游客处理，不能继续读取其偏好/历史（AUTH-17）。
    where: { id: session.user.id, deletedAt: null, disabledAt: null },
    select: { id: true, email: true, nickname: true, role: true, sessionVersion: true },
  })
  if (!dbUser) return null
  // 旧 cookie 可能没有 sessionVersion（升级前签发），按 0 处理，与 requireActiveUser 一致。
  if ((session.user.sessionVersion ?? 0) !== dbUser.sessionVersion) return null
  return dbUser
}

/**
 * 要求当前请求已登录、账号有效且角色为 ADMIN。
 * 未登录/已注销返回 401；已登录但权限不足返回 403；通过时返回用户信息。
 */
export async function requireAdmin(event: H3Event): Promise<ActiveUser> {
  const user = await requireActiveUser(event)
  if (user.role !== 'ADMIN') {
    throw createError({ statusCode: 403, statusMessage: '需要管理员权限' })
  }
  return user
}
