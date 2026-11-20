// 邮箱换绑确认：POST /api/auth/confirm-email（AUTH-15）。
//
// 用户在邮件里点开 /confirm-email?token=xxx 后，由确认页把 token 提交到这里。
// 校验规则与重置密码一致：
// - 只按 SHA-256 摘要查库，明文 token 不落库；
// - 过期与不存在返回同一条 400 提示，不泄露 token 处于哪种状态；
// - updateMany 的「比较并清空」保证并发点击同一链接时只有一次生效。
//
// 该接口允许未登录访问：用户很可能在手机上打开邮件，或用另一台设备确认。

import { confirmEmailBodySchema, confirmEmailOkSchema } from '../../../shared/schemas/auth'
import { hashToken } from '../../utils/authToken'

export default defineEventHandler(async (event) => {
  const body = await validateBody(event, confirmEmailBodySchema)
  const tokenHash = hashToken(body.token)

  const user = await prisma.user.findFirst({
    where: { pendingEmailTokenHash: tokenHash, deletedAt: null },
    select: {
      id: true,
      pendingEmail: true,
      pendingEmailExpiresAt: true,
      nickname: true,
      role: true,
      sessionVersion: true,
    },
  })

  // 统一提示：不区分「token 不存在」与「已过期」，避免给攻击者额外信息。
  if (
    !user ||
    !user.pendingEmail ||
    !user.pendingEmailExpiresAt ||
    user.pendingEmailExpiresAt.getTime() <= Date.now()
  ) {
    throw createError({ statusCode: 400, statusMessage: '确认链接已失效，请重新申请换绑' })
  }

  const nextEmail = user.pendingEmail

  // 申请时校验过唯一性，但「申请 → 用户去收信 → 点击确认」之间可能有时间差：
  // 这期间该邮箱可能被其他人注册或换绑走，确认时必须再查一次（DATA-03：不过滤 deletedAt）。
  const occupied = await prisma.user.findFirst({
    where: { email: nextEmail, NOT: { id: user.id } },
    select: { id: true },
  })
  if (occupied)
    throw createError({ statusCode: 409, statusMessage: '该邮箱已被使用，请重新申请换绑' })

  // 条件里带 pendingEmailTokenHash：并发点击同一链接时，
  // 第一个请求清空 token，第二个 count 为 0 即判定失效，避免链接被复用。
  const result = await prisma.user.updateMany({
    where: { id: user.id, pendingEmailTokenHash: tokenHash, deletedAt: null },
    data: {
      email: nextEmail,
      pendingEmail: null,
      pendingEmailTokenHash: null,
      pendingEmailExpiresAt: null,
    },
  })
  if (result.count === 0) {
    throw createError({ statusCode: 400, statusMessage: '确认链接已失效，请重新申请换绑' })
  }

  // 如果当前浏览器登录的正是这个账号，用新邮箱重写会话，让「我的」页头部立即更新；
  // 与 AUTH-11 一致：不递增 sessionVersion，其他设备仍凭同一账号 id 有效，只是展示值滞后到下次登录。
  const session = await getUserSession(event)
  if (session.user?.id === user.id) {
    await setUserSession(event, {
      user: {
        id: user.id,
        email: nextEmail,
        nickname: user.nickname,
        role: user.role,
        sessionVersion: user.sessionVersion,
      },
    })
  }

  return assertResponse(confirmEmailOkSchema, { ok: true, email: nextEmail }, '邮箱确认')
})
