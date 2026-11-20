// 前后端共用的 Zod 契约（shared/schemas）回归测试。
// 这些规则直接对应 domain.md 的编号，改 schema 时测试会先失败，避免前后端口径漂移。

import { describe, expect, it } from 'vitest'
import { dishesQuerySchema, randomQuerySchema } from '../../shared/schemas/dish'
import { loginBodySchema, registerBodySchema } from '../../shared/schemas/auth'
import { recommendRequestSchema } from '../../shared/schemas/recommend'

describe('randomQuerySchema（DISH-04/05）', () => {
  it('excludeIds 接受逗号字符串并去掉空白项', () => {
    const parsed = randomQuerySchema.parse({ excludeIds: 'd1, d2,,d3' })
    expect(parsed.excludeIds).toEqual(['d1', 'd2', 'd3'])
  })

  it('excludeIds 为空串时视为未传', () => {
    expect(randomQuerySchema.parse({ excludeIds: '' }).excludeIds).toBeUndefined()
  })

  it('includeRecent 只认 true / 1，字符串 false 不能变成 true', () => {
    expect(randomQuerySchema.parse({ includeRecent: 'true' }).includeRecent).toBe(true)
    expect(randomQuerySchema.parse({ includeRecent: '1' }).includeRecent).toBe(true)
    expect(randomQuerySchema.parse({ includeRecent: 'false' }).includeRecent).toBe(false)
    expect(randomQuerySchema.parse({}).includeRecent).toBe(false)
  })

  it('historyDays 允许 0~30 的整数，越界必须拒绝', () => {
    expect(randomQuerySchema.parse({ historyDays: '0' }).historyDays).toBe(0)
    expect(randomQuerySchema.parse({ historyDays: '7' }).historyDays).toBe(7)
    expect(randomQuerySchema.safeParse({ historyDays: '-1' }).success).toBe(false)
    expect(randomQuerySchema.safeParse({ historyDays: '31' }).success).toBe(false)
    expect(randomQuerySchema.safeParse({ historyDays: '3.5' }).success).toBe(false)
  })

  it('mealType 只接受固定枚举', () => {
    expect(randomQuerySchema.safeParse({ mealType: 'LUNCH' }).success).toBe(true)
    expect(randomQuerySchema.safeParse({ mealType: 'SUPPER' }).success).toBe(false)
  })
})

describe('dishesQuerySchema（DISH-03）', () => {
  it('keyword 会 trim，分页有默认值', () => {
    const parsed = dishesQuerySchema.parse({ keyword: '  螺蛳粉  ' })
    expect(parsed.keyword).toBe('螺蛳粉')
    expect(parsed.page).toBe(1)
    expect(parsed.pageSize).toBe(10)
  })

  it('pageSize 上限 50，page 不能为 0', () => {
    expect(dishesQuerySchema.safeParse({ pageSize: '51' }).success).toBe(false)
    expect(dishesQuerySchema.safeParse({ page: '0' }).success).toBe(false)
  })

  it('keyword 超过 50 字拒绝', () => {
    expect(dishesQuerySchema.safeParse({ keyword: 'a'.repeat(51) }).success).toBe(false)
  })
})

describe('认证契约（AUTH-04）', () => {
  it('注册邮箱会 trim + 转小写，密码至少 8 位', () => {
    const parsed = registerBodySchema.parse({ email: '  Demo@Example.COM ', password: '12345678' })
    expect(parsed.email).toBe('demo@example.com')
    expect(registerBodySchema.safeParse({ email: 'a@b.com', password: '1234567' }).success).toBe(
      false,
    )
  })

  it('登录字段是 login（邮箱或手机号），不是 email', () => {
    expect(loginBodySchema.safeParse({ login: 'a@b.com', password: 'x' }).success).toBe(true)
    expect(loginBodySchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(false)
  })
})

describe('recommendRequestSchema（REC-05）', () => {
  it('message 限 200 字，history 最多 12 条', () => {
    expect(recommendRequestSchema.safeParse({ message: '想吃辣' }).success).toBe(true)
    expect(recommendRequestSchema.safeParse({ message: '辣'.repeat(201) }).success).toBe(false)

    const history = Array.from({ length: 13 }, () => ({ role: 'user' as const, content: 'hi' }))
    expect(recommendRequestSchema.safeParse({ message: 'hi', history }).success).toBe(false)
  })

  it('单条 history 内容限 300 字，角色只有 user / assistant', () => {
    expect(
      recommendRequestSchema.safeParse({
        message: 'hi',
        history: [{ role: 'system', content: 'x' }],
      }).success,
    ).toBe(false)
    expect(
      recommendRequestSchema.safeParse({
        message: 'hi',
        history: [{ role: 'user', content: 'x'.repeat(301) }],
      }).success,
    ).toBe(false)
  })
})
