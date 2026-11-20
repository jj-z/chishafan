// 管理员重置用户密码：POST /api/admin/users/:id/reset-password（P2-11 / ADMIN-03）。
// 只写入新的密码哈希并让目标账号旧会话失效；响应与审计都不得包含密码相关信息。

import {
  adminUserOkSchema,
  adminUserParamsSchema,
  adminUserResetPasswordSchema,
} from '../../../../../shared/schemas/admin'
import { recordAdminAudit } from '../../../../utils/adminAudit'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const params = validateParams(event, adminUserParamsSchema)
  const body = await validateBody(event, adminUserResetPasswordSchema)

  // 与禁用/改角色一致：管理员改自己的密码请走个人资料页（需要验证当前密码）。
  if (params.id === admin.id) {
    throw createError({ statusCode: 400, statusMessage: '不能重置自己的密码，请到个人资料页修改' })
  }

  const target = await prisma.user.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true },
  })
  if (!target) throw createError({ statusCode: 404, statusMessage: '用户不存在或已注销' })

  // 密码哈希在事务外计算：hashPassword 是 CPU 密集型，放在事务里会延长数据库事务时间。
  const passwordHash = await hashPassword(body.password)

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: params.id },
      data: {
        passwordHash,
        // 重置密码等同改密（AUTH-12）：目标账号所有旧会话下一次请求 401。
        sessionVersion: { increment: 1 },
      },
    })
    await recordAdminAudit(tx, {
      adminId: admin.id,
      targetType: 'USER',
      targetId: params.id,
      action: 'RESET_PASSWORD',
      detail: '管理员重置密码',
    })
  })

  return assertResponse(adminUserOkSchema, { ok: true }, '重置密码')
})
