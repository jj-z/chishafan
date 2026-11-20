// 个人资料修改：PATCH /api/me/profile。
// 昵称、手机号、邮箱均可修改（AUTH-07 / AUTH-11 / AUTH-16）。
//
// 邮箱与手机号都是登录凭证，改绑都走两步确认：
// - 邮箱（AUTH-15）：只写 pendingEmail 并给新邮箱发确认邮件，点击链接后才生效；
// - 手机号（AUTH-16）：只写 pendingPhone 并给新号码发 6 位验证码，调用确认接口校验后才生效。
// 确认前 email / phone 保持原值，原邮箱与原手机号都还能登录，避免填错后把账号锁死。
//
// 昵称立即生效；修改成功后重写会话（AUTH-10），否则「我的」页头部仍是旧昵称。

import { meProfileUpdateResultSchema, meProfileUpdateSchema } from '../../../shared/schemas/me'
import { buildAppUrl, generateNumericCode, generateToken, hashToken } from '../../utils/authToken'
import { sendEmailChangeVerificationEmail } from '../../utils/mail'
import { assertContactChangeAllowed } from '../../utils/rateLimit'
import { sendVerificationCode } from '../../utils/sms'

/** 邮箱换绑确认链接有效期：30 分钟。比找回密码长，因为用户可能要切到另一台设备收信。 */
const EMAIL_CHANGE_TOKEN_TTL_MS = 30 * 60 * 1000

/** 手机验证码有效期：5 分钟。6 位数字熵低，只能靠短有效期 + 次数上限控制风险。 */
const PHONE_CODE_TTL_MS = 5 * 60 * 1000

export default defineEventHandler(async (event) => {
  // 统一鉴权：已注销或会话版本过期的请求在这里直接 401（AUTH-12）。
  const user = await requireActiveUser(event)
  const body = await validateBody(event, meProfileUpdateSchema)

  const dbUser = await prisma.user.findFirst({
    where: { id: user.id },
    select: { email: true, phone: true, passwordHash: true, sessionVersion: true },
  })
  if (!dbUser) throw createError({ statusCode: 404, statusMessage: '用户不存在或已注销' })

  // undefined 表示「本次不改」，空串表示「清空」：统一存 null，避免空串占用唯一索引。
  const nickname =
    body.nickname === undefined ? undefined : body.nickname.length > 0 ? body.nickname : null
  const nextPhone = body.phone === undefined ? undefined : body.phone.length > 0 ? body.phone : null
  const nextEmail = body.email
  const emailChanged = !!nextEmail && nextEmail !== dbUser.email
  // 与数据库里的原值比较，而不是「请求里有没有 phone」：
  // 前端每次保存都会带上完整的手机号输入框，只有真的改了才触发验证流程。
  const phoneChanged = body.phone !== undefined && nextPhone !== dbUser.phone

  const passwordVerified = async () => {
    if (
      !body.currentPassword ||
      !(await verifyPassword(dbUser.passwordHash, body.currentPassword))
    ) {
      throw createError({ statusCode: 400, statusMessage: '当前密码不正确' })
    }
  }

  // 为什么改邮箱/手机号必须再校验密码：仅凭会话 cookie 不能改走登录凭证，
  // 否则 cookie 被盗时攻击者可以直接把账号「搬走」（AUTH-11 / AUTH-16）。
  if (emailChanged || phoneChanged) await passwordVerified()

  // 唯一性校验不过滤 deletedAt：软删除账号仍占用原值（DATA-03），
  // 与注册接口保持一致，防止已注销账号的邮箱/手机号被重新分配。
  if (emailChanged) {
    const occupied = await prisma.user.findFirst({
      where: { email: nextEmail, NOT: { id: user.id } },
      select: { id: true },
    })
    if (occupied) throw createError({ statusCode: 409, statusMessage: '邮箱已被使用' })
  }
  if (phoneChanged && nextPhone) {
    const occupied = await prisma.user.findFirst({
      where: { phone: nextPhone, NOT: { id: user.id } },
      select: { id: true },
    })
    if (occupied) throw createError({ statusCode: 409, statusMessage: '手机号已被使用' })
  }

  // 每次申请都会真实发信/发短信：先限流再生成凭证，防止被盗会话拿来轰炸他人邮箱/手机。
  // 同一请求里同时改邮箱和手机号只计一次，避免正常操作被双倍计数。
  if (emailChanged || phoneChanged) assertContactChangeAllowed(user.id)

  let pendingEmailFields:
    | {
        pendingEmail: string
        pendingEmailTokenHash: string
        pendingEmailExpiresAt: Date
      }
    | undefined
  let devConfirmUrl: string | undefined

  if (emailChanged && nextEmail) {
    const { token, hash, expiresAt } = generateToken(EMAIL_CHANGE_TOKEN_TTL_MS)
    const confirmUrl = buildAppUrl('/confirm-email', token)

    // 先发信、后写库：发信失败时不留下一个用户永远收不到链接的「待确认邮箱」。
    // 不预置初值，catch 分支必然抛错，只有成功才需要读取 sent。
    let sent: boolean
    try {
      sent = (await sendEmailChangeVerificationEmail(nextEmail, confirmUrl)).sent
    } catch {
      throw createError({ statusCode: 503, statusMessage: '邮件发送失败，请稍后再试' })
    }

    if (!sent) {
      // 开发环境未配置 Resend：把确认链接回传给前端，方便本机跑完整换绑流程。
      // 生产环境不能把链接交给调用方（等于跳过「证明邮箱归属」），只能明确报错。
      if (!import.meta.dev) {
        throw createError({ statusCode: 503, statusMessage: '邮件服务未配置，请联系管理员' })
      }
      console.info(`[邮箱换绑] 未配置 Resend，确认链接：${confirmUrl}`)
      devConfirmUrl = confirmUrl
    }

    pendingEmailFields = {
      pendingEmail: nextEmail,
      pendingEmailTokenHash: hash,
      pendingEmailExpiresAt: expiresAt,
    }
  }

  let pendingPhoneFields:
    | {
        pendingPhone: string | null
        pendingPhoneCodeHash: string | null
        pendingPhoneExpiresAt: Date | null
        pendingPhoneAttempts: number
      }
    | undefined
  let devCode: string | undefined
  // 清空手机号立即生效；换绑新号码则必须等验证码确认，phone 保持原值。
  let clearPhone = false

  if (phoneChanged) {
    if (!nextPhone) {
      // 清空手机号不会让账号多出一个登录入口，无需短信验证，直接生效并清掉旧的待确认记录。
      clearPhone = true
      pendingPhoneFields = {
        pendingPhone: null,
        pendingPhoneCodeHash: null,
        pendingPhoneExpiresAt: null,
        pendingPhoneAttempts: 0,
      }
    } else {
      const code = generateNumericCode()
      const hash = hashToken(code)
      const expiresAt = new Date(Date.now() + PHONE_CODE_TTL_MS)

      // 先发短信、后写库：发送失败时不留下永远收不到验证码的待确认号码。
      // 同上，不预置初值，catch 分支会直接抛错。
      let sent: boolean
      try {
        sent = (await sendVerificationCode(nextPhone, code)).sent
      } catch {
        throw createError({ statusCode: 503, statusMessage: '短信发送失败，请稍后再试' })
      }

      if (!sent) {
        // 与邮件一致：开发环境回传验证码方便联调，生产环境必须明确报错而不是假装发送成功。
        if (!import.meta.dev) {
          throw createError({ statusCode: 503, statusMessage: '短信服务未配置，请联系管理员' })
        }
        console.info(`[手机号换绑] 未配置短信服务，验证码：${code}`)
        devCode = code
      }

      pendingPhoneFields = {
        pendingPhone: nextPhone,
        pendingPhoneCodeHash: hash,
        pendingPhoneExpiresAt: expiresAt,
        // 新验证码重置输错计数，旧验证码同时失效。
        pendingPhoneAttempts: 0,
      }
    }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      nickname,
      // 清空手机号立即写 null；换绑新号码时 phone 保持原值，等确认接口再改写。
      phone: clearPhone ? null : undefined,
      // 邮箱/手机号本身要等确认接口才写入；这里只覆盖待确认字段。
      // 没改对应字段时传 undefined，Prisma 不写该列，已有的待确认记录保持不变。
      pendingEmail: pendingEmailFields?.pendingEmail,
      pendingEmailTokenHash: pendingEmailFields?.pendingEmailTokenHash,
      pendingEmailExpiresAt: pendingEmailFields?.pendingEmailExpiresAt,
      pendingPhone: pendingPhoneFields?.pendingPhone,
      pendingPhoneCodeHash: pendingPhoneFields?.pendingPhoneCodeHash,
      pendingPhoneExpiresAt: pendingPhoneFields?.pendingPhoneExpiresAt,
      pendingPhoneAttempts: pendingPhoneFields?.pendingPhoneAttempts,
    },
    select: {
      email: true,
      phone: true,
      nickname: true,
      pendingEmail: true,
      pendingPhone: true,
      role: true,
      sessionVersion: true,
    },
  })

  // 会话里存了昵称与邮箱：不重写的话前端 session 仍是旧值，要重新登录才更新（AUTH-10）。
  // 注意 email 仍是原值——换绑要等用户点击确认链接后才生效（AUTH-15）。
  await setUserSession(event, {
    user: {
      id: user.id,
      email: updated.email,
      nickname: updated.nickname,
      role: updated.role,
      sessionVersion: updated.sessionVersion,
    },
  })

  const payload = {
    email: updated.email,
    phone: updated.phone,
    nickname: updated.nickname,
    pendingEmail: updated.pendingEmail,
    pendingPhone: updated.pendingPhone,
    ...(devConfirmUrl ? { devConfirmUrl } : {}),
    ...(devCode ? { devCode } : {}),
  }
  return assertResponse(meProfileUpdateResultSchema, payload, '个人资料')
})
