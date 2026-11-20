// 撤销就餐记录：DELETE /api/history/:id（HISTORY-04）。
// 误点「今天就吃它」需要能纠正，但历史是推荐去重与统计的依据，
// 因此只允许撤销「本人 + 最近 7 天」的记录，超出窗口返回 403。

import { historyDeleteOkSchema, historyParamsSchema } from '../../../shared/schemas/history'
import { todayDateOnly } from '../../utils/date'

/** 可撤销窗口：今天 + 前 6 天，共 7 个自然日。 */
const REVOKE_WINDOW_DAYS = 7

export default defineEventHandler(async (event) => {
  const user = await requireActiveUser(event)
  const params = validateParams(event, historyParamsSchema)

  const record = await prisma.diningHistory.findFirst({
    where: { id: params.id, userId: user.id },
    select: { id: true, eatenOn: true },
  })

  // 别人的记录与不存在的记录统一返回 404：410/403 会暴露「这条 id 存在但不是你的」。
  if (!record) {
    throw createError({ statusCode: 404, statusMessage: '记录不存在' })
  }

  // eatenOn 是 @db.Date 的 UTC 零点，cutoff 也用 todayDateOnly 生成，避免本地时区把窗口算偏。
  const cutoff = todayDateOnly()
  cutoff.setUTCDate(cutoff.getUTCDate() - (REVOKE_WINDOW_DAYS - 1))
  if (record.eatenOn.getTime() < cutoff.getTime()) {
    throw createError({
      statusCode: 403,
      statusMessage: `只能撤销最近 ${REVOKE_WINDOW_DAYS} 天的就餐记录`,
    })
  }

  // deleteMany 不抛「记录已不存在」，并发重复点击时后一次返回 deleted=false 即可。
  const result = await prisma.diningHistory.deleteMany({ where: { id: record.id } })

  return assertResponse(historyDeleteOkSchema, { deleted: result.count > 0 }, '撤销就餐记录')
})
