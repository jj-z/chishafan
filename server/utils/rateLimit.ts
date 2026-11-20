// server/utils/rateLimit.ts
// 进程内限流与每日配额（AUTH-13 / REC-07）。
//
// 为什么用内存而不是 Redis：当前是单实例部署，登录撞库与 AI 刷量属于「挡住绝大多数
// 脚本」的成本优化，内存实现零依赖、零迁移即可满足。
// 部署前提必须明确：多实例（或 Serverless 多副本）下每个进程各算各的，实际阈值会被
// 放大 N 倍；届时必须把本文件替换为 Redis 等共享存储实现，接口签名保持不变。

import type { H3Event } from 'h3'

/** 登录失败窗口与阈值：1 分钟内同一 IP+账号失败 5 次后，第 6 次起 429（AUTH-13）。 */
const LOGIN_WINDOW_MS = 60_000
const LOGIN_MAX_FAILURES = 5

/** 注册窗口与阈值：按 IP 计算尝试次数，防止脚本批量注册。 */
const REGISTER_WINDOW_MS = 60_000
const REGISTER_MAX_ATTEMPTS = 5

/** 找回密码申请窗口与阈值：按 IP + 邮箱计算，防止轰炸某个人的邮箱（AUTH-14）。 */
const RESET_WINDOW_MS = 60_000
const RESET_MAX_ATTEMPTS = 5

/** 联系方式（邮箱/手机号）换绑窗口与阈值：按用户计算，防止已登录账号反复给对方发确认邮件/短信。 */
const CONTACT_CHANGE_WINDOW_MS = 10 * 60_000
const CONTACT_CHANGE_MAX_ATTEMPTS = 5

/** key = `${ip}|${account}`，value = 失败时间戳列表。 */
const loginFailures = new Map<string, number[]>()
/** key = ip，value = 注册尝试时间戳列表。 */
const registerAttempts = new Map<string, number[]>()
/** key = `${ip}|${account}`，value = 找回密码申请时间戳列表。 */
const passwordResetRequests = new Map<string, number[]>()
/** key = userId，value = 联系方式换绑申请时间戳列表。 */
const contactChangeRequests = new Map<string, number[]>()

/**
 * 取请求来源 IP。
 * xForwardedFor 只有在可信反代后面才可靠；这里只用于限流粒度，不参与任何鉴权判断，
 * 因此即使被伪造也只影响攻击者自己的额度。
 */
function clientIp(event: H3Event): string {
  return getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
}

/**
 * 取出窗口内的记录并原地裁剪。
 * 用滑动窗口（时间戳列表）而不是固定窗口计数器：固定窗口在跨窗口边界时
 * 可能放过接近两倍的请求，撞库场景下这个缺口不能接受。
 */
function recentHits(
  map: Map<string, number[]>,
  key: string,
  windowMs: number,
  now: number,
): number[] {
  const hits = (map.get(key) ?? []).filter((ts) => now - ts < windowMs)
  if (hits.length) map.set(key, hits)
  else map.delete(key)

  // 防内存泄漏：攻击者可用大量随机账号制造不同 key，超过阈值时清掉所有过期窗口。
  if (map.size > 5000) {
    for (const [k, v] of map) {
      if (!v.some((ts) => now - ts < windowMs)) map.delete(k)
    }
  }
  return hits
}

function loginKey(event: H3Event, account: string): string {
  // 账号统一转小写：避免攻击者用大小写变体绕过「按账号计数」。
  return `${clientIp(event)}|${account.trim().toLowerCase()}`
}

/**
 * 登录前检查：尝试次数过多时直接 429。
 * 只在「失败」时计数（见 recordLoginFailure），正常用户连续输错几次也不会被错误封禁。
 */
export function assertLoginAllowed(event: H3Event, account: string): void {
  const hits = recentHits(loginFailures, loginKey(event, account), LOGIN_WINDOW_MS, Date.now())
  if (hits.length >= LOGIN_MAX_FAILURES) {
    throw createError({ statusCode: 429, statusMessage: '尝试次数太多了，请 1 分钟后再试' })
  }
}

/** 登录失败后记一次，供下一次 assertLoginAllowed 判断。 */
export function recordLoginFailure(event: H3Event, account: string): void {
  const key = loginKey(event, account)
  const now = Date.now()
  const hits = recentHits(loginFailures, key, LOGIN_WINDOW_MS, now)
  hits.push(now)
  loginFailures.set(key, hits)
}

/** 登录成功后清空失败计数：用户想起密码后不应继续被旧失败次数限制。 */
export function clearLoginFailures(event: H3Event, account: string): void {
  loginFailures.delete(loginKey(event, account))
}

/**
 * 注册前检查并记录一次尝试（按 IP）。
 * 注册没有「成功/失败」的天然分界（参数错、重复邮箱都可能发生），
 * 因此按尝试次数限流，避免通过反复提交探测邮箱是否已注册。
 */
export function assertRegisterAllowed(event: H3Event): void {
  const key = clientIp(event)
  const now = Date.now()
  const hits = recentHits(registerAttempts, key, REGISTER_WINDOW_MS, now)
  if (hits.length >= REGISTER_MAX_ATTEMPTS) {
    throw createError({ statusCode: 429, statusMessage: '注册太频繁了，请 1 分钟后再试' })
  }
  hits.push(now)
  registerAttempts.set(key, hits)
}

/**
 * 找回密码申请前检查并记录一次（按 IP + 邮箱）。
 * 计数的是「申请次数」而不是失败次数：该接口对不存在的邮箱也返回成功，
 * 没有失败信号可用；限制申请频率本身就能防止轰炸某个人的邮箱。
 */
export function assertPasswordResetAllowed(event: H3Event, account: string): void {
  const key = `${clientIp(event)}|${account.trim().toLowerCase()}`
  const now = Date.now()
  const hits = recentHits(passwordResetRequests, key, RESET_WINDOW_MS, now)
  if (hits.length >= RESET_MAX_ATTEMPTS) {
    throw createError({ statusCode: 429, statusMessage: '操作太频繁了，请 1 分钟后再试' })
  }
  hits.push(now)
  passwordResetRequests.set(key, hits)
}

/**
 * 联系方式（邮箱/手机号）换绑申请前检查并记录一次（按用户）。
 * 每次申请都会给「新联系方式」真实发信/发短信：不限流的话，被盗会话可以把这里当成轰炸工具。
 * 按 userId 而不是 IP 计数：换 IP 不能绕过；同一局域网多账号也互不影响。
 */
export function assertContactChangeAllowed(userId: string): void {
  const now = Date.now()
  const hits = recentHits(contactChangeRequests, userId, CONTACT_CHANGE_WINDOW_MS, now)
  if (hits.length >= CONTACT_CHANGE_MAX_ATTEMPTS) {
    throw createError({ statusCode: 429, statusMessage: '操作太频繁了，请稍后再试' })
  }
  hits.push(now)
  contactChangeRequests.set(userId, hits)
}

/**
 * 读取每日配额上限。
 * 非法值（非数字、<=0）回退到默认，避免把环境变量写错导致全站 AI 直接不可用。
 */
function quotaLimit(envKey: string, fallback: number): number {
  const raw = process.env[envKey]
  const value = raw ? Number.parseInt(raw, 10) : Number.NaN
  return Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * 自然日 key（服务器本地时区，生产为东八区）。
 * 用日期字符串而不是定时任务重置：跨天时 key 变化即自动从 0 计数。
 */
function todayKey(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

interface DailyQuota {
  day: string
  used: number
}

/** key = `user:${id}`（登录）或 `ip:${ip}`（游客）。 */
const aiQuotas = new Map<string, DailyQuota>()

/**
 * 扣减一次 AI 配额（REC-07）。
 * 调用方必须在「请求上游 LLM 之前」调用：超限时不得再发起任何上游请求。
 * 登录用户按账号计数（换 IP 绕不过）；游客没有账号，只能按 IP。
 */
export function consumeAiQuota(
  event: H3Event,
  userId: string | null,
): { allowed: boolean; used: number; limit: number } {
  const now = new Date()
  const day = todayKey(now)
  const limit = userId
    ? quotaLimit('NUXT_AI_DAILY_QUOTA_USER', 30)
    : quotaLimit('NUXT_AI_DAILY_QUOTA_GUEST', 5)

  const key = userId ? `user:${userId}` : `ip:${clientIp(event)}`
  const current = aiQuotas.get(key)
  const used = current && current.day === day ? current.used : 0

  if (used >= limit) return { allowed: false, used, limit }

  aiQuotas.set(key, { day, used: used + 1 })

  // 防内存泄漏：游客 IP 维度 key 可能很多，超过阈值时清掉非今日的旧记录。
  if (aiQuotas.size > 5000) {
    for (const [k, v] of aiQuotas) {
      if (v.day !== day) aiQuotas.delete(k)
    }
  }

  return { allowed: true, used: used + 1, limit }
}
