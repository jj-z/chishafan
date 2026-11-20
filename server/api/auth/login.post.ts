// server/api/auth/login.post.ts
// 用户登录：邮箱（或手机号）+ 密码。
//
// 策略：
// - 先按邮箱查；没找到再按手机号查（用户可能用手机号注册但邮箱也填了）
// - 密码校验失败统一返回「邮箱/手机号或密码错误」，不泄露账号是否存在（安全）
// - 登录成功后写 session

import { authOkSchema, loginBodySchema } from '../../../shared/schemas/auth'
import { assertLoginAllowed, clearLoginFailures, recordLoginFailure } from '../../utils/rateLimit'

export default defineEventHandler(async (event) => {
  const body = await validateBody(event, loginBodySchema)

  // 撞库防护（AUTH-13）：同一 IP+账号 1 分钟内失败 5 次后直接 429，
  // 不再查库、不再验证密码，避免脚本用无限次尝试猜密码。
  assertLoginAllowed(event, body.login)

  // 邮箱登录时 Zod 已 trim，手机号登录时原样匹配
  const login = body.login
  const user =
    (await prisma.user.findFirst({ where: { email: login } })) ??
    (await prisma.user.findFirst({ where: { phone: login } }))

  // 软删除用户不允许登录（deletedAt 非空即视为已注销）
  if (!user || user.deletedAt || !(await verifyPassword(user.passwordHash, body.password))) {
    // 只记录失败：成功登录会清空计数，正常用户不会因为之前输错几次被误伤。
    recordLoginFailure(event, body.login)
    throw createError({ statusCode: 401, statusMessage: '邮箱/手机号或密码错误' })
  }

  // 被管理员禁用的账号即使密码正确也必须拒绝登录（AUTH-17），且不签发会话。
  // 放在密码校验之后：否则未持有正确密码的人也能从 403/401 的差异探测账号是否被禁用。
  if (user.disabledAt) {
    throw createError({ statusCode: 403, statusMessage: '账号已被禁用，请联系管理员' })
  }

  clearLoginFailures(event, body.login)

  await setUserSession(event, {
    user: {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      role: user.role,
      // 会话版本随登录写入（AUTH-12），改密/注销后旧会话会在下一次请求被拒绝。
      sessionVersion: user.sessionVersion,
    },
  })

  const payload = {
    ok: true as const,
    user: { id: user.id, email: user.email, nickname: user.nickname },
  }
  return assertResponse(authOkSchema, payload, '登录')
})
