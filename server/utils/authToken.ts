// 账号相关的一次性 token 工具（AUTH-14 / AUTH-15）：找回密码与邮箱换绑共用。
//
// 设计原则：
// - 明文 token 只出现在邮件链接里，数据库只存 SHA-256 摘要；数据库泄漏也无法直接接管账号；
// - 链接根地址必须来自 NUXT_APP_URL，不能用请求 Host 拼接（Host 可伪造，会被引导到钓鱼站）；
// - 有效期由调用方传入：找回密码 15 分钟，邮箱换绑 30 分钟（更长是因为用户可能需要切换设备收信）。

import { createHash, randomBytes, randomInt } from 'node:crypto'

export interface GeneratedToken {
  /** 明文 token：只用于拼邮件链接，绝不写数据库。 */
  token: string
  /** 入库的 SHA-256 摘要。 */
  hash: string
  expiresAt: Date
}

/**
 * 生成 32 字节（256 位）随机 token。
 * base64url 不含 +/=，可以直接放进 URL 查询参数，不需要额外转义。
 */
export function generateToken(ttlMs: number): GeneratedToken {
  const token = randomBytes(32).toString('base64url')
  return {
    token,
    hash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlMs),
  }
}

/**
 * 计算 token 摘要。
 * token 本身是高熵随机数，不存在字典穷举风险，用 SHA-256 即可；
 * 不需要像用户密码那样加盐或使用慢哈希（慢哈希是为了抵抗低熵密码的暴力破解）。
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * 生成 6 位数字验证码（手机号换绑，AUTH-16）。
 * 为什么不用 32 字节 token：短信场景用户要手输，长串不现实。
 * 6 位数字只有 100 万种可能，安全依赖「5 分钟过期 + 输错次数上限 + 按用户限流」，
 * 三者必须同时存在，缺一不可；服务端仍只存 SHA-256 哈希，不落明文。
 */
export function generateNumericCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

/** 拼带 token 的站点链接，例如 /reset-password?token=xxx、/confirm-email?token=xxx。 */
export function buildAppUrl(path: string, token: string): string {
  const base = (process.env.NUXT_APP_URL || 'http://localhost:3000').replace(/\/+$/, '')
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${base}${normalized}?token=${encodeURIComponent(token)}`
}
