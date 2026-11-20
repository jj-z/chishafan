// 重置密码：POST /api/auth/reset-password（AUTH-14）。
//
// token 校验规则：
// - 只按 SHA-256 摘要查库，明文 token 不落库；
// - 过期与不存在返回同一条 400 提示，不泄露 token 处于哪种状态；
// - 用 updateMany 的「比较并清空」保证原子性：并发提交同一个 token 时只有一次能成功。

import { resetPasswordBodySchema, resetPasswordOkSchema } from '../../../shared/schemas/auth'
import { hashToken } from '../../utils/authToken'

export default defineEventHandler(async (event) => {
  const body = await validateBody(event, resetPasswordBodySchema)
  const tokenHash = hashToken(body.token)

  const user = await prisma.user.findFirst({
    where: { resetTokenHash: tokenHash, deletedAt: null },
    select: { id: true, resetTokenExpiresAt: true },
  })

  // 统一提示：不区分「token 不存在」与「已过期」，避免给攻击者额外信息。
  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt.getTime() <= Date.now()) {
    throw createError({ statusCode: 400, statusMessage: '重置链接已失效，请重新申请' })
  }

  const passwordHash = await hashPassword(body.password)

  // 条件里带 resetTokenHash：两个请求同时提交同一 token 时，
  // 第一个把 token 清空，第二个 count 为 0 即判定失效，避免 token 被复用。
  const result = await prisma.user.updateMany({
    where: { id: user.id, resetTokenHash: tokenHash },
    data: {
      passwordHash,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      // 自增会话版本（AUTH-12）：重置密码后所有设备的旧会话立即失效。
      sessionVersion: { increment: 1 },
    },
  })

  if (result.count === 0) {
    throw createError({ statusCode: 400, statusMessage: '重置链接已失效，请重新申请' })
  }

  // 用户可能正在某台设备上登录着：一并清掉当前会话，统一要求用新密码重新登录。
  await clearUserSession(event)

  return assertResponse(resetPasswordOkSchema, { ok: true }, '重置密码')
})
