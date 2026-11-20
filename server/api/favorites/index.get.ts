// 收藏列表接口：/api/favorites。
// 需要登录（AUTH-02），按收藏时间倒序返回当前用户的收藏菜品。

import { favoriteListResultSchema, favoritesQuerySchema } from '../../../shared/schemas/favorite'
import { dishSelect, toDishDetail } from '../../utils/dish'

export default defineEventHandler(async (event) => {
  const user = await requireActiveUser(event)
  const query = validateQuery(event, favoritesQuerySchema)

  // 只看 userId 实现账号隔离；软删除/下架的菜不展示，避免收藏列表出现失效菜。
  const where = { userId: user.id, dish: { deletedAt: null, isPublished: true } }
  const [rows, total] = await Promise.all([
    prisma.favorite.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: { createdAt: true, dish: { select: dishSelect } },
    }),
    prisma.favorite.count({ where }),
  ])

  const payload = {
    items: rows.map((r) => ({ dish: toDishDetail(r.dish), createdAt: r.createdAt.toISOString() })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  }
  return assertResponse(favoriteListResultSchema, payload, '收藏列表')
})
