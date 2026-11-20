// 后台新增菜品：POST /api/admin/dishes
// 分类必须存在且未删除，否则会产生指向废弃分类的脏数据。

import { adminDishSchema, dishWriteBodySchema } from '../../../../shared/schemas/admin'
import { recordAdminAudit } from '../../../utils/adminAudit'
import { adminDishSelect, toAdminDish, toDishWriteData } from '../../../utils/dish'
import { scheduleKnowledgeSync } from '../../../utils/knowledge'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await validateBody(event, dishWriteBodySchema)

  const category = await prisma.category.findFirst({
    where: { id: body.categoryId, deletedAt: null },
    select: { id: true },
  })
  if (!category) throw createError({ statusCode: 400, statusMessage: '分类不存在或已删除' })

  // 业务写入与审计必须同事务（ADMIN-02）：否则可能留下无从追责的菜品。
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.dish.create({
      data: toDishWriteData(body),
      select: adminDishSelect,
    })
    await recordAdminAudit(tx, {
      adminId: admin.id,
      action: 'CREATE_DISH',
      targetType: 'DISH',
      targetId: created.id,
      detail: created.name,
    })
    return created
  })

  // 知识库是旁路能力：异步重建向量，embedding 失败只告警，不影响新增结果。
  scheduleKnowledgeSync([row.id])

  return assertResponse(adminDishSchema, toAdminDish(row), '新增菜品')
})
