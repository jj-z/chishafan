// 进程内限流与每日配额（AUTH-13 / REC-07）。
// 被测函数是纯内存逻辑（Map + 时间戳），不连数据库、不发外部请求；
// 只需 stub 掉 Nitro 自动导入的 getRequestIP / createError 即可在裸 Vitest 里跑。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertContactChangeAllowed,
  assertLoginAllowed,
  assertPasswordResetAllowed,
  assertRegisterAllowed,
  clearLoginFailures,
  consumeAiQuota,
  recordLoginFailure,
} from '../../server/utils/rateLimit'

/**
 * Nitro 自动导入的 getRequestIP / createError 在裸 Vitest 里不存在，stub 成内存实现。
 * rateLimit.ts 只在函数被调用时才引用它们（不在模块顶层执行），
 * 因此 stubGlobal 在 import 之后、测试运行之前生效即可。
 */
const mockGetRequestIP = vi.fn(() => '127.0.0.1')

vi.stubGlobal('getRequestIP', mockGetRequestIP)
vi.stubGlobal('createError', (opts: { statusCode: number; statusMessage: string }) => {
  const err = new Error(opts.statusMessage) as Error & { statusCode: number }
  err.statusCode = opts.statusCode
  throw err
})

/** 断言函数抛出指定状态码的错误，用于验证限流触发。 */
function expectStatus(fn: () => void, code: number) {
  try {
    fn()
    throw new Error('expected to throw')
  } catch (err) {
    expect((err as Error & { statusCode?: number }).statusCode).toBe(code)
  }
}

describe('登录限流 AUTH-13', () => {
  beforeEach(() => {
    mockGetRequestIP.mockReturnValue('1.2.3.4')
    // 用一个固定账号，确保只影响本用例。
  })

  it('前 5 次失败不触发限流，第 6 次抛 429', () => {
    const account = 'rate-login@test.com'
    // 前 5 次失败：assert 不抛，record 记一次。
    for (let i = 0; i < 5; i++) {
      expect(() => assertLoginAllowed({} as never, account)).not.toThrow()
      recordLoginFailure({} as never, account)
    }
    // 第 6 次（即第 6 次 assert 时已有 5 条失败记录）触发 429。
    expectStatus(() => assertLoginAllowed({} as never, account), 429)
  })

  it('登录成功后清空失败计数，后续登录不再 429', () => {
    const account = 'rate-clear@test.com'
    for (let i = 0; i < 5; i++) recordLoginFailure({} as never, account)
    // 第 6 次本来会 429，但先 clear 就不会。
    clearLoginFailures({} as never, account)
    expect(() => assertLoginAllowed({} as never, account)).not.toThrow()
  })

  it('账号大小写不敏感，大写变体不会绕过计数', () => {
    const lower = 'case@test.com'
    const upper = 'CASE@TEST.COM'
    for (let i = 0; i < 5; i++) recordLoginFailure({} as never, lower)
    // 用大写账号 assert，应命中同一 key 而 429。
    expectStatus(() => assertLoginAllowed({} as never, upper), 429)
  })
})

describe('注册限流（按 IP）', () => {
  beforeEach(() => mockGetRequestIP.mockReturnValue('5.6.7.8'))

  it('同一 IP 第 6 次注册抛 429', () => {
    for (let i = 0; i < 5; i++) {
      expect(() => assertRegisterAllowed({} as never)).not.toThrow()
    }
    expectStatus(() => assertRegisterAllowed({} as never), 429)
  })
})

describe('找回密码申请限流 AUTH-14', () => {
  beforeEach(() => mockGetRequestIP.mockReturnValue('9.9.9.9'))

  it('同一 IP+邮箱第 6 次申请抛 429', () => {
    const email = 'reset@test.com'
    for (let i = 0; i < 5; i++) {
      expect(() => assertPasswordResetAllowed({} as never, email)).not.toThrow()
    }
    expectStatus(() => assertPasswordResetAllowed({} as never, email), 429)
  })
})

describe('联系方式换绑限流 AUTH-15/16', () => {
  it('同一用户 10 分钟内第 6 次申请抛 429', () => {
    const userId = 'user-contact-1'
    for (let i = 0; i < 5; i++) {
      expect(() => assertContactChangeAllowed(userId)).not.toThrow()
    }
    expectStatus(() => assertContactChangeAllowed(userId), 429)
  })
})

describe('AI 每日配额 REC-07', () => {
  const originalUser = process.env.NUXT_AI_DAILY_QUOTA_USER
  const originalGuest = process.env.NUXT_AI_DAILY_QUOTA_GUEST

  afterEach(() => {
    if (originalUser === undefined) delete process.env.NUXT_AI_DAILY_QUOTA_USER
    else process.env.NUXT_AI_DAILY_QUOTA_USER = originalUser
    if (originalGuest === undefined) delete process.env.NUXT_AI_DAILY_QUOTA_GUEST
    else process.env.NUXT_AI_DAILY_QUOTA_GUEST = originalGuest
  })

  it('登录用户配额默认 30 次/天，超限 allowed=false 且不消耗', () => {
    process.env.NUXT_AI_DAILY_QUOTA_USER = '30'
    const userId = 'user-quota-1'
    for (let i = 0; i < 30; i++) {
      expect(consumeAiQuota({} as never, userId).allowed).toBe(true)
    }
    // 第 31 次超限。
    const result = consumeAiQuota({} as never, userId)
    expect(result.allowed).toBe(false)
    expect(result.used).toBe(30)
    expect(result.limit).toBe(30)
  })

  it('游客配额默认 5 次/天，按 IP 计数', () => {
    mockGetRequestIP.mockReturnValue('20.20.20.20')
    process.env.NUXT_AI_DAILY_QUOTA_GUEST = '5'
    for (let i = 0; i < 5; i++) {
      expect(consumeAiQuota({} as never, null).allowed).toBe(true)
    }
    expect(consumeAiQuota({} as never, null).allowed).toBe(false)
  })

  it('环境变量非法值回退默认，不会让配额变 0 导致全站不可用', () => {
    process.env.NUXT_AI_DAILY_QUOTA_USER = 'abc'
    const userId = 'user-quota-fallback'
    // 默认 30，第 1 次应该允许。
    expect(consumeAiQuota({} as never, userId).allowed).toBe(true)
  })
})
