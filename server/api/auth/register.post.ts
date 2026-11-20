// server/api/auth/register.post.ts
// 用户注册：邮箱 + 密码（手机号可选）。
//
// 规则：
// - 邮箱唯一，手机号可选但填了也唯一（见 AUTH-04 / DATA-03）
// - 密码长度 ≥ 8 位（AUTH-04）
// - 注册成功直接登录（写 session），不要求二次登录（AUTH-04）
// - 禁止暴露 passwordHash 到 session（敏感数据）

import { authOkSchema, registerBodySchema } from '../../../shared/schemas/auth'
import { assertRegisterAllowed } from '../../utils/rateLimit'

export default defineEventHandler(async (event) => {
  const body = await validateBody(event, registerBodySchema)

  // 注册限流（AUTH-13）：按 IP 限制 1 分钟内的尝试次数，防止脚本批量注册与邮箱探测。
  assertRegisterAllowed(event)

  const existingEmail = await prisma.user.findUnique({
    where: { email: body.email },
    select: { id: true },
  })
  if (existingEmail) {
    throw createError({ statusCode: 409, statusMessage: '邮箱已注册' })
  }
  // 手机号可选；只有非空才查唯一，避免空串匹配到不填手机号的用户。
  const phone = body.phone && body.phone.length > 0 ? body.phone : null
  if (phone) {
    const existingPhone = await prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    })
    if (existingPhone) {
      throw createError({ statusCode: 409, statusMessage: '手机号已注册' })
    }
  }

  const user = await prisma.user.create({
    data: {
      email: body.email,
      phone,
      nickname: body.nickname && body.nickname.length > 0 ? body.nickname : null,
      passwordHash: await hashPassword(body.password),
    },
  })

  // 注册即登录：session 只存必要字段（cookie 有 4KB 限制），不存 passwordHash。
  await setUserSession(event, {
    user: {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      role: user.role,
      sessionVersion: user.sessionVersion,
    },
  })

  const payload = {
    ok: true as const,
    user: { id: user.id, email: user.email, nickname: user.nickname },
  }
  return assertResponse(authOkSchema, payload, '注册')
})
