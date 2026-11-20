// 后台菜品列表：GET /api/admin/dishes
// 与用户端列表的区别：能看到下架菜品（运营需要管理它们），但仍过滤软删除。

import { adminDishListResultSchema, adminDishesQuerySchema } from '../../../../shared/schemas/admin'
import { adminDishSelect, toAdminDish } from '../../../utils/dish'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = validateQuery(event, adminDishesQuerySchema)

  const where = {
    // 软删除的菜品对后台也不再展示（DATA-01），下架菜则保留给运营查看。
    deletedAt: null,
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.keyword ? { name: { contains: query.keyword, mode: 'insensitive' as const } } : {}),
    // 质量巡检（P2-14）：空字符串和 null 都要算「没有图片」，否则运营补过空串后仍会看到它。
    ...(query.missing === 'image' ? { OR: [{ imageUrl: null }, { imageUrl: '' }] } : {}),
    ...(query.missing === 'allergens' ? { allergens: { isEmpty: true } } : {}),
    ...(query.missing === 'ingredients' ? { ingredients: { isEmpty: true } } : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.dish.findMany({
      where,
      select: adminDishSelect,
      orderBy: [{ updatedAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.dish.count({ where }),
  ])

  const payload = {
    items: rows.map(toAdminDish),
    total,
    page: query.page,
    pageSize: query.pageSize,
  }
  return assertResponse(adminDishListResultSchema, payload, '后台菜品列表')
})
