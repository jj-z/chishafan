// 菜品详情接口：/api/dishes/:id。

import { dishParamsSchema, dishSchema } from '../../../shared/schemas/dish'
import { dishSelect, toDishDetail } from '../../utils/dish'

export default defineEventHandler(async (event) => {
  const params = validateParams(event, dishParamsSchema)

  // 详情同样过滤软删除 + 下架，避免用户从旧链接看到不该看的菜。
  const row = await prisma.dish.findFirst({
    where: { id: params.id, deletedAt: null, isPublished: true },
    select: dishSelect,
  })
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: '菜品不存在或已下架' })
  }
  return assertResponse(dishSchema, toDishDetail(row), '菜品详情')
})
