// 推荐效果埋点批量上报：POST /api/tracking/recommend-events（P2-09 / TRACK-01~04）。
// 旁路接口：允许游客（userId 为空），批量写入 + eventId 去重；
// 任何脏数据都只丢弃，不能因为埋点让主流程报错。

import {
  recommendEventsBodySchema,
  recommendEventsOkSchema,
} from '../../../shared/schemas/tracking'

export default defineEventHandler(async (event) => {
  const body = await validateBody(event, recommendEventsBodySchema)
  // 用 getOptionalActiveUser：失效会话按游客处理，不会把事件记到别人账号上（AUTH-12）。
  const user = await getOptionalActiveUser(event)

  // 一次性查出真实存在的菜：不存在的 dishId 直接丢弃，避免外键报错变成 500（TRACK-04）。
  // 软删除的菜仍保留行，历史曝光事件照样可以写入，所以不过滤 deletedAt。
  const dishIds = [...new Set(body.events.map((item) => item.dishId))]
  const existing = await prisma.dish.findMany({
    where: { id: { in: dishIds } },
    select: { id: true },
  })
  const validDishIds = new Set(existing.map((row) => row.id))

  const data = body.events
    .filter((item) => validDishIds.has(item.dishId))
    .map((item) => ({
      eventId: item.eventId,
      userId: user?.id ?? null,
      dishId: item.dishId,
      type: item.type,
      source: item.source,
    }))

  if (!data.length) {
    return assertResponse(recommendEventsOkSchema, { accepted: 0 }, '推荐埋点')
  }

  // skipDuplicates 依赖 eventId 唯一键：网络重试造成的重复提交只计一次（TRACK-02）。
  const result = await prisma.recommendEvent.createMany({ data, skipDuplicates: true })
  return assertResponse(recommendEventsOkSchema, { accepted: result.count }, '推荐埋点')
})
