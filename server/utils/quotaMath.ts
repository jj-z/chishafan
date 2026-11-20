// 配额计算中的纯函数（D6）。
// 单独成模块是为了能在不连数据库的前提下单测（pitfalls #12）。

// 额度按「一次完整问答」估算：Agent 决策一次约 2k prompt token，加上流式作答，
// 单轮实测约 5k。游客 5k 只够问一次，明显不可用，因此游客额度按 4 轮左右给。
const DEFAULT_USER_TOKENS = 50_000
const DEFAULT_GUEST_TOKENS = 20_000

function limitFromEnv(key: string, fallback: number): number {
  const raw = process.env[key]
  const value = raw ? Number.parseInt(raw, 10) : Number.NaN
  return Number.isFinite(value) && value > 0 ? value : fallback
}

/** 按登录态取每日 token 上限。登录用户按账号，游客按 IP。 */
export function tokenLimitFor(userId: string | null): number {
  return userId
    ? limitFromEnv('NUXT_AI_DAILY_TOKEN_USER', DEFAULT_USER_TOKENS)
    : limitFromEnv('NUXT_AI_DAILY_TOKEN_GUEST', DEFAULT_GUEST_TOKENS)
}

/** 服务器本地时区的自然日；跨天 key 变化即自动从 0 计数（与 rateLimit 一致）。 */
export function quotaDay(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export interface TokenQuotaSnapshot {
  used: number
  limit: number
  remaining: number
}

/** 把已用量归一成对外快照；非法值按 0 处理，剩余不允许为负。 */
export function toQuotaSnapshot(used: number, limit: number): TokenQuotaSnapshot {
  const safeUsed = Number.isFinite(used) ? used : 0
  return { used: safeUsed, limit, remaining: Math.max(0, limit - safeUsed) }
}
