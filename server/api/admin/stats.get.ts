// 后台数据看板：GET /api/admin/stats?days=7（P2-12）。
// 口径说明：总量是当前全量，趋势 / 热门菜 / 零结果搜索 / AI 指标只看「最近 N 天」，
// 避免运营被历史累积数据干扰判断。

import { adminStatsQuerySchema, adminStatsSchema } from '../../../shared/schemas/admin'
import { toDateOnlyString, todayDateOnly } from '../../utils/date'

const DAY_MS = 24 * 60 * 60 * 1000

/** 把时间戳按服务器本地日历转 YYYY-MM-DD，保证趋势桶与用户理解的「今天」一致。 */
function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = validateQuery(event, adminStatsQuerySchema)
  const days = query.days

  // eatenOn 是 date 列，用 UTC 零点即可表示本地日历日期（见 server/utils/date.ts）。
  const today = todayDateOnly()
  const fromDate = new Date(today.getTime() - (days - 1) * DAY_MS)

  // createdAt 是 timestamp（按 UTC 存储），下界取本地零点对应的时刻，
  // 否则 UTC+8 的用户在凌晨会看到「昨天」的数据混进今天。
  const now = new Date()
  const fromTimestamp = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1))

  const [
    users,
    dishes,
    publishedDishes,
    favorites,
    histories,
    historyRows,
    recentUsers,
    topRows,
    emptyRows,
    aiTotal,
    aiFailed,
    aiDuration,
  ] = await Promise.all([
    // 总量：软删除的用户/菜品不计入（DATA-01）。
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.dish.count({ where: { deletedAt: null } }),
    prisma.dish.count({ where: { deletedAt: null, isPublished: true } }),
    prisma.favorite.count(),
    prisma.diningHistory.count(),
    // 趋势：eatenOn 已经是「日期」，直接 groupBy 不需要 truncate。
    prisma.diningHistory.groupBy({
      by: ['eatenOn'],
      where: { eatenOn: { gte: fromDate } },
      _count: { id: true },
    }),
    // 用户量级小，取回 createdAt 在内存里按本地日期分桶，避免依赖数据库时区设置。
    prisma.user.findMany({
      where: { deletedAt: null, createdAt: { gte: fromTimestamp } },
      select: { createdAt: true },
    }),
    prisma.diningHistory.groupBy({
      by: ['dishId'],
      where: { eatenOn: { gte: fromDate } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    }),
    prisma.searchLog.groupBy({
      by: ['keyword'],
      where: { resultCount: 0, createdAt: { gte: fromTimestamp } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    }),
    prisma.aiCallLog.count({ where: { createdAt: { gte: fromTimestamp } } }),
    prisma.aiCallLog.count({ where: { createdAt: { gte: fromTimestamp }, ok: false } }),
    prisma.aiCallLog.aggregate({
      where: { createdAt: { gte: fromTimestamp } },
      _avg: { durationMs: true },
    }),
  ])

  // 热门菜要展示菜名，单独回查一次（groupBy 只能拿到 dishId）。
  const dishNames = topRows.length
    ? await prisma.dish.findMany({
        where: { id: { in: topRows.map((row) => row.dishId) } },
        select: { id: true, name: true },
      })
    : []
  const nameById = new Map(dishNames.map((row) => [row.id, row.name]))

  const historyByDate = new Map(
    historyRows.map((row) => [toDateOnlyString(row.eatenOn), row._count.id]),
  )
  const usersByDate = new Map<string, number>()
  for (const row of recentUsers) {
    const key = localDateKey(row.createdAt)
    usersByDate.set(key, (usersByDate.get(key) ?? 0) + 1)
  }

  // 补齐没有数据的日期：趋势图需要连续的时间轴，缺日会让柱子看起来「粘」在一起。
  const trend = Array.from({ length: days }, (_, index) => {
    const key = toDateOnlyString(new Date(fromDate.getTime() + index * DAY_MS))
    return {
      date: key,
      histories: historyByDate.get(key) ?? 0,
      newUsers: usersByDate.get(key) ?? 0,
    }
  })

  const avgDuration = aiDuration._avg.durationMs ?? 0
  const payload = {
    range: { days, from: toDateOnlyString(fromDate), to: toDateOnlyString(today) },
    totals: { users, dishes, publishedDishes, favorites, histories },
    trend,
    topDishes: topRows.map((row) => ({
      id: row.dishId,
      name: nameById.get(row.dishId) ?? '（已删除菜品）',
      count: row._count.id,
    })),
    emptySearches: emptyRows.map((row) => ({ keyword: row.keyword, count: row._count.id })),
    ai: {
      total: aiTotal,
      failed: aiFailed,
      // 保留 4 位小数，前端再乘 100 显示百分比；避免服务端取整后无法还原。
      failureRate: aiTotal ? Number((aiFailed / aiTotal).toFixed(4)) : 0,
      avgDurationMs: Math.round(avgDuration),
    },
  }

  return assertResponse(adminStatsSchema, payload, '后台数据看板')
})
