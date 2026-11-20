// 后台操作审计查询：GET /api/admin/audit-logs?targetType=&page=&pageSize=（P2-13 / ADMIN-04）。
// 只读接口：审计记录是事件日志，不提供修改/删除入口，保证追责链条完整。

import { adminAuditListResultSchema, adminAuditQuerySchema } from '../../../shared/schemas/admin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = validateQuery(event, adminAuditQuerySchema)

  // 目标类型是唯一筛选维度：运营最常问的是「这道菜/这个账号被谁改过」，
  // 按目标 id 反查可以再补，但列表页先保证能按类型缩小范围。
  const where = query.targetType ? { targetType: query.targetType } : {}

  const [rows, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        adminId: true,
        action: true,
        targetType: true,
        targetId: true,
        detail: true,
        createdAt: true,
        admin: { select: { email: true } },
      },
    }),
    prisma.adminAuditLog.count({ where }),
  ])

  const payload = {
    items: rows.map((row) => ({
      id: row.id,
      adminId: row.adminId,
      adminEmail: row.admin.email,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      detail: row.detail,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  }

  return assertResponse(adminAuditListResultSchema, payload, '操作审计列表')
})
