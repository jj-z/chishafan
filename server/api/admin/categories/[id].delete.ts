// 后台删除分类：DELETE /api/admin/categories/:id
// 软删除（DATA-01）：分类被菜品引用，物理删除会破坏历史数据。
// 若该分类下还有未删除的菜品，直接拒绝，避免出现“菜品指向一个不存在的分类”。

import { deleteOkSchema } from '../../../../shared/schemas/admin'
import { dishParamsSchema } from '../../../../shared/schemas/dish'
import { recordAdminAudit } from '../../../utils/adminAudit'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const params = validateParams(event, dishParamsSchema)

  const current = await prisma.category.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, name: true },
  })
  if (!current) throw createError({ statusCode: 404, statusMessage: '分类不存在或已删除' })

  // 只统计未删除的菜品：已软删除的菜品不再占用这个分类，不应阻止分类删除。
  const dishCount = await prisma.dish.count({
    where: { categoryId: params.id, deletedAt: null },
  })
  if (dishCount > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `该分类下还有 ${dishCount} 道菜品，请先调整菜品分类`,
    })
  }

  await prisma.$transaction(async (tx) => {
    await tx.category.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    })
    await recordAdminAudit(tx, {
      adminId: admin.id,
      action: 'DELETE_CATEGORY',
      targetType: 'CATEGORY',
      targetId: current.id,
      detail: current.name,
    })
  })

  return assertResponse(deleteOkSchema, { ok: true }, '删除分类')
})
