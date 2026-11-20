// 后台编辑分类：PUT /api/admin/categories/:id
// 使用 PUT 全量更新：后台表单本来就整体提交，省掉“哪些字段允许部分更新”的判断。

import { adminCategorySchema, categoryWriteBodySchema } from '../../../../shared/schemas/admin'
import { dishParamsSchema } from '../../../../shared/schemas/dish'
import { recordAdminAudit } from '../../../utils/adminAudit'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const params = validateParams(event, dishParamsSchema)
  const body = await validateBody(event, categoryWriteBodySchema)

  const current = await prisma.category.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true },
  })
  if (!current) throw createError({ statusCode: 404, statusMessage: '分类不存在或已删除' })

  // 改名时要检查重名；改成自己原来的名字不算冲突，所以用 NOT: { id }。
  const duplicated = await prisma.category.findFirst({
    where: { name: body.name, NOT: { id: params.id } },
    select: { id: true },
  })
  if (duplicated) throw createError({ statusCode: 409, statusMessage: '分类名称已存在' })

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.category.update({
      where: { id: params.id },
      data: { name: body.name, sortOrder: body.sortOrder },
      select: { id: true, name: true, sortOrder: true, createdAt: true },
    })
    await recordAdminAudit(tx, {
      adminId: admin.id,
      action: 'UPDATE_CATEGORY',
      targetType: 'CATEGORY',
      targetId: updated.id,
      detail: updated.name,
    })
    return updated
  })

  return assertResponse(
    adminCategorySchema,
    { ...row, createdAt: row.createdAt.toISOString() },
    '编辑分类',
  )
})
