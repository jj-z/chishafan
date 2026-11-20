// 后台分类列表：GET /api/admin/categories
// 与用户端 /api/categories 的区别：后台按 sortOrder 展示全部未删除分类，
// 且返回 sortOrder/createdAt 供运营调整顺序。

import { adminCategoryListSchema } from '../../../../shared/schemas/admin'

export default defineEventHandler(async (event) => {
  // 每个后台接口第一行都要校验管理员身份（AUTH-03），不能依赖前端路由拦截。
  await requireAdmin(event)

  const rows = await prisma.category.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, sortOrder: true, createdAt: true },
  })

  const payload = rows.map((row) => ({
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
  }))
  return assertResponse(adminCategoryListSchema, payload, '后台分类列表')
})
