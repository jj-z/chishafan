// 修改用户状态：PATCH /api/admin/users/:id（P2-11 / AUTH-17 / ADMIN-03）。
// 支持两类变更：禁用/启用（disabledAt）与角色变更，可在同一次请求里提交。
// 写操作与审计在同一事务内完成（ADMIN-02）。

import type { Prisma } from '../../../../shared/generated/prisma/client'
import type { AdminAuditAction } from '../../../../shared/generated/prisma/enums'
import {
  adminUserParamsSchema,
  adminUserSchema,
  adminUserUpdateSchema,
} from '../../../../shared/schemas/admin'
import { recordAdminAudit } from '../../../utils/adminAudit'
import { adminUserSelect, toAdminUser } from '../../../utils/adminUser'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const params = validateParams(event, adminUserParamsSchema)
  const body = await validateBody(event, adminUserUpdateSchema)

  // 防止把自己锁在后台外（AUTH-17）：禁用自己会立刻失去权限，
  // 改掉自己的 ADMIN 角色则再也没有入口改回来。改密请走个人资料页。
  if (params.id === admin.id) {
    throw createError({ statusCode: 400, statusMessage: '不能修改自己的角色或状态' })
  }

  const target = await prisma.user.findFirst({
    where: { id: params.id, deletedAt: null },
    select: adminUserSelect,
  })
  if (!target) throw createError({ statusCode: 404, statusMessage: '用户不存在或已注销' })

  const data: Prisma.UserUpdateInput = {}
  const audits: { action: AdminAuditAction; detail: string }[] = []
  // 角色变化会让旧会话里的 role 过期（前端菜单仍按旧角色渲染），
  // 禁用则必须踢下线；两种情况都自增版本，只自增一次，避免同一操作算两次失效。
  let bumpSessionVersion = false

  if (body.role !== undefined && body.role !== target.role) {
    data.role = body.role
    audits.push({ action: 'CHANGE_ROLE', detail: body.role })
    bumpSessionVersion = true
  }

  // disabled 与数据库状态相同视为无变化，不写审计（避免「点两次产生两条记录」）。
  if (body.disabled !== undefined && body.disabled !== Boolean(target.disabledAt)) {
    data.disabledAt = body.disabled ? new Date() : null
    audits.push({
      action: body.disabled ? 'DISABLE_USER' : 'ENABLE_USER',
      detail: body.disabled ? '已禁用' : '已启用',
    })
    if (body.disabled) bumpSessionVersion = true
  }

  // 没有任何实际变化时直接返回当前状态：不让接口变成可被反复调用的空操作。
  if (audits.length === 0) {
    return assertResponse(adminUserSchema, toAdminUser(target), '修改用户')
  }

  if (bumpSessionVersion) {
    data.sessionVersion = { increment: 1 }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.user.update({
      where: { id: params.id },
      data,
      select: adminUserSelect,
    })
    for (const audit of audits) {
      await recordAdminAudit(tx, {
        adminId: admin.id,
        targetType: 'USER',
        targetId: params.id,
        action: audit.action,
        detail: audit.detail,
      })
    }
    return row
  })

  return assertResponse(adminUserSchema, toAdminUser(updated), '修改用户')
})
