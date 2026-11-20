// 撤销「不感兴趣」：DELETE /api/feedback/:dishId。
// 幂等：记录不存在（或本来就不是当前用户的）也返回成功，前端不必区分「已撤销」和「从未标记」。

import { feedbackOkSchema } from '../../../shared/schemas/feedback'
import { dishParamsSchema } from '../../../shared/schemas/dish'

export default defineEventHandler(async (event) => {
  const user = await requireActiveUser(event)
  const params = validateParams(event, dishParamsSchema)

  // where 必须带 userId：只凭 dishId 删除会允许用户撤销别人的反馈。
  // deleteMany 在 0 行时也不报错，正好满足幂等要求。
  await prisma.dishFeedback.deleteMany({
    where: { userId: user.id, dishId: params.id, action: 'DISLIKE' },
  })

  return assertResponse(feedbackOkSchema, { ok: true }, '撤销不感兴趣')
})
