// 「我的」页统计接口：GET /api/me/summary。
// 收藏数与历史数都从真实库取，保证跨设备一致。

import { meSummarySchema } from '../../../shared/schemas/me'

export default defineEventHandler(async (event) => {
  const user = await requireActiveUser(event)

  const [dbUser, favoriteCount, historyCount] = await Promise.all([
    prisma.user.findFirst({
      where: { id: user.id, deletedAt: null },
      select: { email: true, nickname: true },
    }),
    prisma.favorite.count({
      where: { userId: user.id, dish: { deletedAt: null, isPublished: true } },
    }),
    prisma.diningHistory.count({ where: { userId: user.id } }),
  ])

  if (!dbUser) throw createError({ statusCode: 404, statusMessage: '用户不存在或已注销' })

  const payload = {
    nickname: dbUser.nickname,
    email: dbUser.email,
    favoriteCount,
    historyCount,
  }
  return assertResponse(meSummarySchema, payload, '我的统计')
})
