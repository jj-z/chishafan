// 批量操作菜品：POST /api/admin/dishes/batch（P2-15）。
// 支持批量上架 / 下架 / 改分类；每条菜品都单独写审计，便于事后按菜品追溯。

import {
  adminDishBatchBodySchema,
  adminDishBatchResultSchema,
} from '../../../../shared/schemas/admin'
import { scheduleKnowledgeSync } from '../../../utils/knowledge'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await validateBody(event, adminDishBatchBodySchema)

  // 只处理未删除的菜：软删除的菜不该被批量操作「复活」。
  const dishes = await prisma.dish.findMany({
    where: { id: { in: body.ids }, deletedAt: null },
    select: { id: true },
  })
  if (dishes.length === 0) {
    throw createError({ statusCode: 404, statusMessage: '没有可操作的菜品' })
  }

  let data: { isPublished: boolean } | { categoryId: string }
  let detail: string

  if (body.action === 'category') {
    const categoryId = body.categoryId as string
    const category = await prisma.category.findFirst({
      where: { id: categoryId, deletedAt: null },
      select: { name: true },
    })
    if (!category) throw createError({ statusCode: 400, statusMessage: '目标分类不存在或已删除' })
    data = { categoryId }
    detail = `批量改分类：${category.name}`
  } else {
    const isPublished = body.action === 'publish'
    data = { isPublished }
    detail = isPublished ? '批量上架' : '批量下架'
  }

  // updateMany + createMany 放在同一事务：避免出现「菜品改了但审计没写」。
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.dish.updateMany({
      where: { id: { in: dishes.map((dish) => dish.id) } },
      data,
    })
    await tx.adminAuditLog.createMany({
      data: dishes.map((dish) => ({
        adminId: admin.id,
        action: 'UPDATE_DISH' as const,
        targetType: 'DISH' as const,
        targetId: dish.id,
        detail,
      })),
    })
    return result.count
  })

  // 上下架与改分类都会影响检索可见性/内容，异步重建这批菜的知识片段。
  scheduleKnowledgeSync(dishes.map((dish) => dish.id))

  return assertResponse(adminDishBatchResultSchema, { updated }, '批量操作菜品')
})
