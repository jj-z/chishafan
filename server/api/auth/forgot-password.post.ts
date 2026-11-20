// 找回密码申请：POST /api/auth/forgot-password（AUTH-14）。
//
// 安全要点：
// 1. 无论邮箱是否存在都返回同一成功响应，避免被用来探测哪些邮箱已注册；
// 2. 同一 IP + 邮箱限流，防止通过接口轰炸某个人的邮箱；
// 3. token 只存 SHA-256 哈希、15 分钟过期、单次有效；
// 4. 邮件没有真正发出时必须清空 token 并报错，禁止假装发送成功。

import { forgotPasswordBodySchema, forgotPasswordOkSchema } from '../../../shared/schemas/auth'
import { sendPasswordResetEmail } from '../../utils/mail'
import { buildAppUrl, generateToken } from '../../utils/authToken'
import { assertPasswordResetAllowed } from '../../utils/rateLimit'

/** 找回密码链接有效期：15 分钟。 */
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000

/** 清空 token：发送失败时不能留下一个用户永远收不到链接的「有效 token」。 */
async function clearResetToken(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { resetTokenHash: null, resetTokenExpiresAt: null },
  })
}

export default defineEventHandler(async (event) => {
  const body = await validateBody(event, forgotPasswordBodySchema)

  // 先限流再查库：避免攻击者用这个接口同时做邮箱枚举与邮件轰炸。
  assertPasswordResetAllowed(event, body.email)

  // 已注销账号不能找回密码（deletedAt 非空），但对调用方仍返回成功，不暴露账号状态。
  const user = await prisma.user.findFirst({
    where: { email: body.email, deletedAt: null },
    select: { id: true, email: true },
  })
  if (!user) {
    // 注意：这里不返回 devResetUrl，否则开发环境会泄露「该邮箱不存在」。
    return assertResponse(forgotPasswordOkSchema, { ok: true }, '找回密码')
  }

  const { token, hash, expiresAt } = generateToken(RESET_TOKEN_TTL_MS)

  // 每次申请覆盖旧 token：用户邮箱里可能躺着多封邮件，只让最新的一封有效。
  await prisma.user.update({
    where: { id: user.id },
    data: { resetTokenHash: hash, resetTokenExpiresAt: expiresAt },
  })

  const resetUrl = buildAppUrl('/reset-password', token)

  // 不预置 false：只有 try 成功才会走到下面判断，catch 一定抛错，预置值纯属噪音。
  let sent: boolean
  try {
    sent = (await sendPasswordResetEmail(user.email, resetUrl)).sent
  } catch {
    // 上游发信失败：清掉刚才写入的 token，用户重新申请时会生成新的。
    await clearResetToken(user.id)
    throw createError({ statusCode: 503, statusMessage: '邮件发送失败，请稍后再试' })
  }

  if (!sent) {
    // 开发环境未配置 Resend：直接回传重置链接，方便本机跑完整流程。
    // 生产环境不能把链接返回给调用方（等于绕过邮箱验证），只能明确报错。
    if (import.meta.dev) {
      console.info(`[找回密码] 未配置 Resend，重置链接：${resetUrl}`)
      return assertResponse(forgotPasswordOkSchema, { ok: true, devResetUrl: resetUrl }, '找回密码')
    }
    await clearResetToken(user.id)
    throw createError({ statusCode: 503, statusMessage: '邮件服务未配置，请联系管理员' })
  }

  return assertResponse(forgotPasswordOkSchema, { ok: true }, '找回密码')
})
