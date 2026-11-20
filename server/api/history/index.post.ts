// 「就吃它」接口：POST /api/history。
// 一餐的每道菜写一条 DiningHistory（HIST-01/03），同一天同一道菜去重（HIST-02）。

import { historyBodySchema, historyOkSchema } from '../../../shared/schemas/history'

export default defineEventHandler(async (event) => {
  const user = await requireActiveUser(event)
  const body = await validateBody(event, historyBodySchema)

  // 去重 dishIds，避免前端误传重复 id 让唯一索引抛错。
  const dishIds = [...new Set(body.dishIds)]

  // 校验所有菜品存在且可见，防止给已下架/删除的菜写历史。
  const dishes = await prisma.dish.findMany({
    where: { id: { in: dishIds }, deletedAt: null, isPublished: true },
    select: { id: true },
  })
  const validIds = new Set(dishes.map((d) => d.id))
  if (validIds.size !== dishIds.length) {
    throw createError({ statusCode: 400, statusMessage: '包含不存在或已下架的菜品' })
  }

  // eatenOn 只存日期（@db.Date），统一走 todayDateOnly()：
  // 它取本地日历的年月日再构造成 UTC 零点，避免直接 new Date(y, m, d) 在 UTC+8 下
  // 被 Prisma 按 UTC 截断成前一天（详见 server/utils/date.ts）。
  const eatenOn = todayDateOnly()

  // createMany + skipDuplicates 利用唯一索引 (userId,dishId,eatenOn) 自动跳过已存在的行，
  // 比逐条 upsert 更简洁，且能精确返回实际新增条数（HIST-02）。
  const result = await prisma.diningHistory.createMany({
    data: dishIds.map((dishId) => ({ userId: user.id, dishId, eatenOn })),
    skipDuplicates: true,
  })

  return assertResponse(historyOkSchema, { recorded: result.count }, '就餐历史')
})
