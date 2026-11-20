// 个人资料读取：GET /api/me/profile。
// 只返回邮箱、手机号、昵称；passwordHash 属于敏感数据，任何接口都不得带出（AUTH-09）。

import { meProfileSchema } from '../../../shared/schemas/me'

export default defineEventHandler(async (event) => {
  const user = await requireActiveUser(event)

  // 会话可能比账号存活更久（软删除后 cookie 仍在），所以这里按 deletedAt 过滤。
  // pendingEmail / pendingPhone 用于前端提示「已有待确认的新联系方式」（AUTH-15 / AUTH-16），
  // 确认前 email / phone 仍是登录凭证。
  const dbUser = await prisma.user.findFirst({
    where: { id: user.id, deletedAt: null },
    select: { email: true, phone: true, nickname: true, pendingEmail: true, pendingPhone: true },
  })
  if (!dbUser) throw createError({ statusCode: 404, statusMessage: '用户不存在或已注销' })

  return assertResponse(meProfileSchema, dbUser, '个人资料')
})
