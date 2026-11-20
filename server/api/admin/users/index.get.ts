// 后台用户列表：GET /api/admin/users（P2-11 / ADMIN-01）。
// 只查未软删除账号；禁用状态由 disabledAt 是否为空推导，不额外维护状态列。

import type { Prisma } from '../../../../shared/generated/prisma/client'
import { adminUserListResultSchema, adminUsersQuerySchema } from '../../../../shared/schemas/admin'
import { adminUserSelect, toAdminUser } from '../../../utils/adminUser'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = validateQuery(event, adminUsersQuerySchema)

  const where: Prisma.UserWhereInput = {
    // 已注销账号不进入运营视野（DATA-01）；禁用账号仍然展示，方便随时启用。
    deletedAt: null,
    ...(query.role ? { role: query.role } : {}),
    ...(query.status === 'ACTIVE' ? { disabledAt: null } : {}),
    ...(query.status === 'DISABLED' ? { disabledAt: { not: null } } : {}),
    // 一个搜索框同时匹配邮箱/手机号/昵称：运营通常只记得其中一项，
    // 用 OR 把三种入口合并，避免前端做「按什么字段搜」的选择题。
    ...(query.keyword
      ? {
          OR: [
            { email: { contains: query.keyword, mode: 'insensitive' as const } },
            { phone: { contains: query.keyword, mode: 'insensitive' as const } },
            { nickname: { contains: query.keyword, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: adminUserSelect,
      // 新注册用户排前面，运营通常先处理最近进来的账号。
      orderBy: [{ createdAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.user.count({ where }),
  ])

  const payload = {
    items: rows.map(toAdminUser),
    total,
    page: query.page,
    pageSize: query.pageSize,
  }
  return assertResponse(adminUserListResultSchema, payload, '后台用户列表')
})
