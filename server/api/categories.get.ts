// 分类列表接口。所有未软删除的分类按 sortOrder 升序返回，前端筛选条用。

import { z } from 'zod'
import { categorySchema } from '../../shared/schemas/dish'

export default defineEventHandler(async () => {
  const rows = await prisma.category.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true },
  })
  return assertResponse(z.array(categorySchema), rows, '分类列表')
})
