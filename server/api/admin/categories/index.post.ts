// 后台新增分类：POST /api/admin/categories
// name 唯一：数据库已有 @unique 约束，这里先查一次给出友好提示，避免把 Prisma 的原始错误抛给前端。

import { adminCategorySchema, categoryWriteBodySchema } from '../../../../shared/schemas/admin'
import { recordAdminAudit } from '../../../utils/adminAudit'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await validateBody(event, categoryWriteBodySchema)

  const exists = await prisma.category.findUnique({
    where: { name: body.name },
    select: { id: true, deletedAt: true },
  })
  // 软删除的分类仍占用唯一 name（DATA-03），所以这里无论是否已删除都直接拒绝并说明原因。
  if (exists) {
    throw createError({
      statusCode: 409,
      statusMessage: exists.deletedAt ? '该分类名称已被已删除的分类占用' : '分类名称已存在',
    })
  }

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.category.create({
      data: { name: body.name, sortOrder: body.sortOrder },
      select: { id: true, name: true, sortOrder: true, createdAt: true },
    })
    await recordAdminAudit(tx, {
      adminId: admin.id,
      action: 'CREATE_CATEGORY',
      targetType: 'CATEGORY',
      targetId: created.id,
      detail: created.name,
    })
    return created
  })

  return assertResponse(
    adminCategorySchema,
    { ...row, createdAt: row.createdAt.toISOString() },
    '新增分类',
  )
})
