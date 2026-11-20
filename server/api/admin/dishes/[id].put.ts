// 后台编辑菜品：PUT /api/admin/dishes/:id
// 全量更新（表单整体提交）；分类同样要校验存在，防止把菜品改到已删除的分类下。

import { adminDishSchema, dishWriteBodySchema } from '../../../../shared/schemas/admin'
import { dishParamsSchema } from '../../../../shared/schemas/dish'
import { recordAdminAudit } from '../../../utils/adminAudit'
import { adminDishSelect, toAdminDish, toDishWriteData } from '../../../utils/dish'
import { scheduleKnowledgeSync } from '../../../utils/knowledge'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const params = validateParams(event, dishParamsSchema)
  const body = await validateBody(event, dishWriteBodySchema)

  const current = await prisma.dish.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, imageUrl: true },
  })
  if (!current) throw createError({ statusCode: 404, statusMessage: '菜品不存在或已删除' })

  const category = await prisma.category.findFirst({
    where: { id: body.categoryId, deletedAt: null },
    select: { id: true },
  })
  if (!category) throw createError({ statusCode: 400, statusMessage: '分类不存在或已删除' })

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.dish.update({
      where: { id: params.id },
      data: toDishWriteData(body),
      select: adminDishSelect,
    })
    await recordAdminAudit(tx, {
      adminId: admin.id,
      action: 'UPDATE_DISH',
      targetType: 'DISH',
      targetId: updated.id,
      detail: updated.name,
    })
    return updated
  })

  // 换图后清理旧的上传文件，避免磁盘上堆积孤儿文件。
  // 必须先确认没有其它菜品仍引用这张图：管理员可能把同一张图复制给多道菜，
  // 直接删会让那些菜的图片变成 404。外链不由本站管理，removeDishImageFile 内部已跳过。
  const oldImage = current.imageUrl
  if (oldImage && oldImage !== row.imageUrl) {
    const stillUsed = await prisma.dish.count({ where: { imageUrl: oldImage } })
    if (stillUsed === 0) await removeDishImageFile(oldImage)
  }

  // 菜名/食材/做法/分类都可能变化，必须重建知识片段，否则问答会继续引用旧内容。
  scheduleKnowledgeSync([row.id])

  return assertResponse(adminDishSchema, toAdminDish(row), '编辑菜品')
})
