// 收藏接口：PUT /api/favorites/:id（收藏）。
// 幂等：同一用户对同一菜品收藏多次不会重复记录（FAV-01/03 由 @@unique 兜底）。

import { favoriteOkSchema } from '../../../shared/schemas/favorite'
import { dishParamsSchema } from '../../../shared/schemas/dish'

export default defineEventHandler(async (event) => {
  const user = await requireActiveUser(event)
  const params = validateParams(event, dishParamsSchema)

  // 菜品必须存在且可见，避免给下架菜建收藏脏数据。
  const dish = await prisma.dish.findFirst({
    where: { id: params.id, deletedAt: null, isPublished: true },
    select: { id: true },
  })
  if (!dish) throw createError({ statusCode: 404, statusMessage: '菜品不存在或已下架' })

  // upsert 同时覆盖「已存在」和「新建」两种情况，配合唯一索引天然幂等。
  await prisma.favorite.upsert({
    where: { userId_dishId: { userId: user.id, dishId: dish.id } },
    update: {},
    create: { userId: user.id, dishId: dish.id },
  })

  return assertResponse(favoriteOkSchema, { favorite: true }, '收藏')
})
