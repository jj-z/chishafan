// 修改密码：PATCH /api/me/password。
// 必须验证当前密码（AUTH-09）：会话 cookie 被盗时也不能直接改密把真正的主人锁在外面。
// 新密码只存 hashPassword 结果，禁止回传任何哈希值。

import { meOkSchema, mePasswordUpdateSchema } from '../../../shared/schemas/me'

export default defineEventHandler(async (event) => {
  const user = await requireActiveUser(event)
  const body = await validateBody(event, mePasswordUpdateSchema)

  const dbUser = await prisma.user.findFirst({
    where: { id: user.id },
    select: { passwordHash: true },
  })
  if (!dbUser) throw createError({ statusCode: 404, statusMessage: '用户不存在或已注销' })

  // 当前密码错误返回 400（用户输入问题）；不区分「账号不存在」，避免泄露信息。
  if (!(await verifyPassword(dbUser.passwordHash, body.currentPassword))) {
    throw createError({ statusCode: 400, statusMessage: '当前密码不正确' })
  }

  // 自增 sessionVersion（AUTH-12）：其他设备手里的旧 cookie 下一次请求即 401，
  // 不必等 7 天有效期结束。密码与会话版本必须在同一次 update 中完成，避免中间态。
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(body.newPassword),
      sessionVersion: { increment: 1 },
    },
    select: { sessionVersion: true },
  })

  // 自增后必须用新版本重写当前设备会话：否则发起改密的这台设备也会被当成旧会话，
  // 改完密码立刻被迫重新登录，体验上像是改密失败。
  await setUserSession(event, {
    user: {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      role: user.role,
      sessionVersion: updated.sessionVersion,
    },
  })

  return assertResponse(meOkSchema, { ok: true }, '修改密码')
})
