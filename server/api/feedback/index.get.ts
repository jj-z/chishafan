// 我的「不感兴趣」列表：GET /api/feedback。
// 需要登录（AUTH-02），只返回当前用户的反馈；被软删除的菜不展示，避免列表里出现无法查看的菜。

import { feedbackListResultSchema } from '../../../shared/schemas/feedback'
import { dishSelect, toDishDetail } from '../../utils/dish'

export default defineEventHandler(async (event) => {
  const user = await requireActiveUser(event)

  // take 100：个人反馈量很小，一次返回全部便于页面直接渲染与撤销；
  // 若将来需要分页，再补 page/pageSize，不提前做。
  const rows = await prisma.dishFeedback.findMany({
    where: { userId: user.id, action: 'DISLIKE', dish: { deletedAt: null } },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { createdAt: true, dish: { select: dishSelect } },
  })

  const payload = {
    items: rows.map((row) => ({
      dish: toDishDetail(row.dish),
      createdAt: row.createdAt.toISOString(),
    })),
  }
  return assertResponse(feedbackListResultSchema, payload, '不感兴趣列表')
})
