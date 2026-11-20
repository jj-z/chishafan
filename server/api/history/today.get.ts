// 「今天吃了什么」查询接口：GET /api/history/today。
// 首页/详情用它把已吃过的按钮置灰。

import { historyTodaySchema } from '../../../shared/schemas/history'

export default defineEventHandler(async (event) => {
  const user = await requireActiveUser(event)

  // 与写入端使用同一个日期工具，保证「写进去的今天」和「查出来的今天」是同一天。
  const eatenOn = todayDateOnly()

  const rows = await prisma.diningHistory.findMany({
    where: { userId: user.id, eatenOn },
    select: { dishId: true },
  })

  return assertResponse(historyTodaySchema, { dishIds: rows.map((r) => r.dishId) }, '今日就餐历史')
})
