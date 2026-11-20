// 取消收藏接口：DELETE /api/favorites/:id。
// 幂等（FAV-02）：记录不存在时也返回成功，不报错。

import { favoriteOkSchema } from '../../../shared/schemas/favorite'
import { dishParamsSchema } from '../../../shared/schemas/dish'

export default defineEventHandler(async (event) => {
  const user = await requireActiveUser(event)
  const params = validateParams(event, dishParamsSchema)

  // deleteMany 在记录不存在时返回 count=0，不会抛错，正好满足幂等要求。
  await prisma.favorite.deleteMany({
    where: { userId: user.id, dishId: params.id },
  })

  return assertResponse(favoriteOkSchema, { favorite: false }, '取消收藏')
})
