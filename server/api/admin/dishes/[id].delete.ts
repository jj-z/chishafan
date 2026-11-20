// 后台删除菜品：DELETE /api/admin/dishes/:id
// 软删除（DATA-01）：就餐历史与收藏仍引用这道菜，物理删除会让历史记录丢失菜名。

import { deleteOkSchema } from '../../../../shared/schemas/admin'
import { dishParamsSchema } from '../../../../shared/schemas/dish'
import { recordAdminAudit } from '../../../utils/adminAudit'
import { scheduleKnowledgeSync } from '../../../utils/knowledge'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const params = validateParams(event, dishParamsSchema)

  const current = await prisma.dish.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, name: true },
  })
  if (!current) throw createError({ statusCode: 404, statusMessage: '菜品不存在或已删除' })

  await prisma.$transaction(async (tx) => {
    await tx.dish.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    })
    // 软删除也属于不可逆的运营动作（推荐池会立刻移除），必须留痕（ADMIN-04）。
    await recordAdminAudit(tx, {
      adminId: admin.id,
      action: 'DELETE_DISH',
      targetType: 'DISH',
      targetId: current.id,
      detail: current.name,
    })
  })

  // 软删除后 sync 会走到 removeDishKnowledge，把该菜的知识片段一并清掉。
  scheduleKnowledgeSync([params.id])

  return assertResponse(deleteOkSchema, { ok: true }, '删除菜品')
})
