// 配额计算的纯函数（D6）。
// 额度默认值与自然日 key 直接决定「用户什么时候被限制」，必须可预期。

import { afterEach, describe, expect, it } from 'vitest'
import { quotaDay, toQuotaSnapshot, tokenLimitFor } from '../../server/utils/quotaMath'

describe('tokenLimitFor', () => {
  const original = { ...process.env }

  afterEach(() => {
    process.env = { ...original }
  })

  it('默认用户 5 万、游客 2 万（单轮约 5k token，游客至少能聊 4 轮）', () => {
    delete process.env.NUXT_AI_DAILY_TOKEN_USER
    delete process.env.NUXT_AI_DAILY_TOKEN_GUEST
    expect(tokenLimitFor('u1')).toBe(50_000)
    expect(tokenLimitFor(null)).toBe(20_000)
  })

  it('环境变量可覆盖，非法值回退默认', () => {
    process.env.NUXT_AI_DAILY_TOKEN_USER = '80000'
    expect(tokenLimitFor('u1')).toBe(80_000)

    process.env.NUXT_AI_DAILY_TOKEN_GUEST = 'abc'
    expect(tokenLimitFor(null)).toBe(20_000)
  })
})

describe('quotaDay', () => {
  it('输出本地时区的 YYYY-MM-DD', () => {
    const date = new Date(2026, 10, 19, 23, 59)
    expect(quotaDay(date)).toBe('2026-11-19')
  })

  it('跨天时 key 变化（用于自动重置额度）', () => {
    expect(quotaDay(new Date(2026, 10, 19, 23, 59))).not.toBe(
      quotaDay(new Date(2026, 10, 20, 0, 1)),
    )
  })
})

describe('toQuotaSnapshot', () => {
  it('剩余额度不允许为负', () => {
    expect(toQuotaSnapshot(120, 100)).toEqual({ used: 120, limit: 100, remaining: 0 })
  })

  it('非法已用量按 0 处理', () => {
    expect(toQuotaSnapshot(Number.NaN, 100)).toEqual({ used: 0, limit: 100, remaining: 100 })
  })
})
