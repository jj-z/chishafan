// 就餐历史列表接口：GET /api/history?page=1&pageSize=10。
// 需要登录（AUTH-02）；按「吃的日期」倒序，同一天再按写入时间倒序。

import { historyListResultSchema, historyQuerySchema } from '../../../shared/schemas/history'
import { dishSelect, toDishDetail } from '../../utils/dish'
import { toDateOnlyString } from '../../utils/date'

export default defineEventHandler(async (event) => {
  const user = await requireActiveUser(event)
  const query = validateQuery(event, historyQuerySchema)

  // 历史是日志（DATA-02），不因菜品下架而消失，所以这里不额外过滤 isPublished；
  // 但如果菜品被软删除，点进去会看到“不存在或已下架”，这是符合预期的。
  const where = { userId: user.id }
  const [rows, total] = await Promise.all([
    prisma.diningHistory.findMany({
      where,
      orderBy: [{ eatenOn: 'desc' }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: { id: true, eatenOn: true, dish: { select: dishSelect } },
    }),
    prisma.diningHistory.count({ where }),
  ])

  const payload = {
    items: rows.map((row) => ({
      id: row.id,
      eatenOn: toDateOnlyString(row.eatenOn),
      dish: toDishDetail(row.dish),
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  }
  return assertResponse(historyListResultSchema, payload, '就餐历史列表')
})
