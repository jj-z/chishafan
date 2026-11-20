// 账号注销：DELETE /api/me（AUTH-12 / DATA-03）。
// 采用软删除（写 deletedAt），不物理删除：
// - 收藏与就餐历史按 DATA-02 保留，便于后续运营分析与误操作追溯；
// - 邮箱/手机号仍被占用，注销后不可再注册（DATA-03）；
// - 自增 sessionVersion 使其他设备手里的旧会话立即失效，最后清掉当前设备的会话。

import { meOkSchema } from '../../../shared/schemas/me'

export default defineEventHandler(async (event) => {
  const user = await requireActiveUser(event)

  await prisma.user.update({
    where: { id: user.id },
    data: {
      deletedAt: new Date(),
      // 与 deletedAt 同时自增：即使某条请求刚好在软删除前完成鉴权，
      // 后续请求也会因版本不一致被 requireActiveUser 拒绝。
      sessionVersion: { increment: 1 },
    },
  })

  await clearUserSession(event)

  return assertResponse(meOkSchema, { ok: true }, '注销账号')
})
