// 标记菜品反馈：POST /api/feedback（PREF-11 / PREF-12）。
// DISLIKE = 不感兴趣，7 天内硬排除；LIKE = 喜欢，只做推荐软加权。
// 需要登录；游客没有账号可以承载这份长期偏好，因此只允许登录用户写入。
// 用 upsert 而不是 create：重复标记不应报唯一键冲突，而是刷新 7 天窗口。

import { feedbackBodySchema, feedbackOkSchema } from '../../../shared/schemas/feedback'

export default defineEventHandler(async (event) => {
  const user = await requireActiveUser(event)
  const body = await validateBody(event, feedbackBodySchema)

  // 只允许对真实存在且未删除的菜反馈：避免前端传任意 id 往库里写脏数据。
  const dish = await prisma.dish.findFirst({
    where: { id: body.dishId, deletedAt: null },
    select: { id: true },
  })
  if (!dish) throw createError({ statusCode: 404, statusMessage: '菜品不存在或已删除' })

  const action = body.action
  const opposite = action === 'LIKE' ? 'DISLIKE' : 'LIKE'

  // 用事务保证「写入新动作 + 删除相反动作」一起生效：
  // 否则同一道菜可能同时存在 LIKE 与 DISLIKE，推荐时既加权又排除，行为不可解释。
  await prisma.$transaction([
    prisma.dishFeedback.upsert({
      where: {
        userId_dishId_action: { userId: user.id, dishId: body.dishId, action },
      },
      create: { userId: user.id, dishId: body.dishId, action },
      // 重复标记视为重新表达偏好：刷新 createdAt，让 7 天窗口从最近一次点击算起。
      update: { createdAt: new Date() },
    }),
    prisma.dishFeedback.deleteMany({
      where: { userId: user.id, dishId: body.dishId, action: opposite },
    }),
  ])

  return assertResponse(
    feedbackOkSchema,
    { ok: true },
    action === 'LIKE' ? '标记喜欢' : '标记不感兴趣',
  )
})
