// 手机号换绑确认：POST /api/me/phone/confirm（AUTH-16）。
//
// PATCH /api/me/profile 只把新号码写入 pendingPhone 并下发验证码；
// 用户在资料页输入验证码后调用本接口，校验通过才真正改写 phone。
//
// 安全要点：
// - 必须登录（requireActiveUser），验证码与「当前账号」绑定，不能跨账号使用；
// - 只按 SHA-256 摘要比较，明文验证码不落库；
// - 5 分钟过期 + 最多 5 次输错，超过即作废（6 位数字只有 100 万种组合，必须限制尝试次数）；
// - 换绑前再查一次唯一性（含软删除占用，DATA-03），防止「申请 → 收码」期间号码被别人占用。

import { mePhoneConfirmResultSchema, mePhoneConfirmSchema } from '../../../../shared/schemas/me'
import { hashToken } from '../../../utils/authToken'

/** 单个验证码允许的最大输错次数：达到后立即作废，必须重新获取。 */
const MAX_CODE_ATTEMPTS = 5

/** 清空待确认记录。过期、次数用尽、号码被占用时都调用，避免留下永远确认不了的 pending 状态。 */
async function clearPendingPhone(userId: string): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId },
    data: {
      pendingPhone: null,
      pendingPhoneCodeHash: null,
      pendingPhoneExpiresAt: null,
      pendingPhoneAttempts: 0,
    },
  })
}

export default defineEventHandler(async (event) => {
  const user = await requireActiveUser(event)
  const body = await validateBody(event, mePhoneConfirmSchema)

  const dbUser = await prisma.user.findFirst({
    where: { id: user.id, deletedAt: null },
    select: {
      id: true,
      pendingPhone: true,
      pendingPhoneCodeHash: true,
      pendingPhoneExpiresAt: true,
      pendingPhoneAttempts: true,
    },
  })

  if (!dbUser?.pendingPhone || !dbUser.pendingPhoneCodeHash || !dbUser.pendingPhoneExpiresAt) {
    throw createError({ statusCode: 400, statusMessage: '验证码已失效，请重新获取' })
  }

  if (dbUser.pendingPhoneExpiresAt.getTime() <= Date.now()) {
    await clearPendingPhone(user.id)
    throw createError({ statusCode: 400, statusMessage: '验证码已失效，请重新获取' })
  }

  if (dbUser.pendingPhoneAttempts >= MAX_CODE_ATTEMPTS) {
    await clearPendingPhone(user.id)
    throw createError({ statusCode: 400, statusMessage: '验证码错误次数过多，请重新获取' })
  }

  if (hashToken(body.code) !== dbUser.pendingPhoneCodeHash) {
    // 先累加失败次数再报错：并发猜码时数据库的自增是原子的，不会被绕过。
    await prisma.user.update({
      where: { id: user.id },
      data: { pendingPhoneAttempts: { increment: 1 } },
    })
    throw createError({ statusCode: 400, statusMessage: '验证码不正确' })
  }

  const nextPhone = dbUser.pendingPhone

  // 申请时校验过唯一性，但「申请 → 用户收短信 → 输入验证码」之间可能有时间差：
  // 这期间该号码可能被其他人注册或换绑走，确认时必须再查一次（DATA-03：不过滤 deletedAt）。
  const occupied = await prisma.user.findFirst({
    where: { phone: nextPhone, NOT: { id: user.id } },
    select: { id: true },
  })
  if (occupied) {
    await clearPendingPhone(user.id)
    throw createError({ statusCode: 409, statusMessage: '该手机号已被使用，请重新申请换绑' })
  }

  // 条件里带 pendingPhoneCodeHash：并发提交同一验证码时只有一次生效，
  // 第一个请求清空待确认字段后，第二个 count 为 0 即判定失效。
  const result = await prisma.user.updateMany({
    where: { id: user.id, pendingPhoneCodeHash: dbUser.pendingPhoneCodeHash, deletedAt: null },
    data: {
      phone: nextPhone,
      pendingPhone: null,
      pendingPhoneCodeHash: null,
      pendingPhoneExpiresAt: null,
      pendingPhoneAttempts: 0,
    },
  })
  if (result.count === 0) {
    throw createError({ statusCode: 400, statusMessage: '验证码已失效，请重新获取' })
  }

  // 会话里没有 phone 字段（只存 id / email / nickname / role），因此无需重写会话；
  // 换绑后新号码立即可用于登录，旧号码不再对应本账号。
  return assertResponse(mePhoneConfirmResultSchema, { ok: true, phone: nextPhone }, '手机号换绑')
})
