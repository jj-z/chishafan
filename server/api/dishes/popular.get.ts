// 热门菜接口：GET /api/dishes/popular（P2-10 空结果兜底）。
//
// “热门”定义为近 30 天被记录就餐次数最多的菜：DiningHistory 是真实吃过的行为，
// 比收藏/点击更能说明一道菜是否受欢迎。记录不足 6 道时用最新上架菜补齐，
// 保证空结果页永远有可点击的内容，不会出现“搜不到就无路可走”的死胡同。

import { popularDishesResultSchema } from '../../../shared/schemas/dish'
import { dishSelect, toDishDetail } from '../../utils/dish'

const POPULAR_LIMIT = 6
const HOT_WINDOW_DAYS = 30

export default defineEventHandler(async () => {
  // groupBy 只按菜品聚合，不把已删除/下架的菜排除在外：
  // 先取热门 id，再回表时统一过滤；被过滤掉的坑位由后面的最新菜补齐。
  const grouped = await prisma.diningHistory.groupBy({
    by: ['dishId'],
    where: {
      eatenOn: { gte: new Date(Date.now() - HOT_WINDOW_DAYS * 24 * 60 * 60 * 1000) },
    },
    _count: { dishId: true },
    orderBy: { _count: { dishId: 'desc' } },
    take: POPULAR_LIMIT,
  })
  const hotIds = grouped.map((row) => row.dishId)

  const hotRows = hotIds.length
    ? await prisma.dish.findMany({
        where: { id: { in: hotIds }, deletedAt: null, isPublished: true },
        select: dishSelect,
      })
    : []

  // findMany 不保证按传入 id 的顺序返回，这里按就餐次数排回热门顺序
  const rowById = new Map(hotRows.map((row) => [row.id, row]))
  const orderedHot = hotIds.map((id) => rowById.get(id)).filter((row) => row !== undefined)

  const remain = POPULAR_LIMIT - orderedHot.length
  const fillRows =
    remain > 0
      ? await prisma.dish.findMany({
          where: {
            deletedAt: null,
            isPublished: true,
            ...(hotIds.length ? { id: { notIn: hotIds } } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: remain,
          select: dishSelect,
        })
      : []

  const payload = {
    items: [...orderedHot, ...fillRows].map(toDishDetail),
  }
  return assertResponse(popularDishesResultSchema, payload, '热门菜')
})
