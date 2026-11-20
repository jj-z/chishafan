// 日期工具（server/utils/date.ts）。
// 这些函数决定「今天吃过的菜不重复」与「只能撤销最近 7 天记录」的窗口边界，
// 时区算偏一天会让去重与撤销逻辑直接出错。

import { afterEach, describe, expect, it, vi } from 'vitest'
import { todayDateOnly, toDateOnlyString } from '../../server/utils/date'

describe('todayDateOnly', () => {
  afterEach(() => vi.useRealTimers())

  it('返回 UTC 零点，时分秒毫秒均为 0', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-11T08:30:45.123Z'))
    const d = todayDateOnly()
    expect(d.getUTCFullYear()).toBe(2026)
    expect(d.getUTCMonth()).toBe(10) // 11 月
    expect(d.getUTCDate()).toBe(11)
    expect(d.getUTCHours()).toBe(0)
    expect(d.getUTCMinutes()).toBe(0)
    expect(d.getUTCSeconds()).toBe(0)
    expect(d.getUTCMilliseconds()).toBe(0)
  })

  it('按本地日历取日期，UTC+8 凌晨不会被算成前一天', () => {
    vi.useFakeTimers()
    // 本地时间 2026-11-11 01:00（UTC+8），对应 UTC 2026-11-10 17:00。
    // 直接 new Date() 取 UTC 日期会得到 10 号，但业务上「今天」应是 11 号。
    vi.setSystemTime(new Date('2026-11-10T17:00:00.000Z'))
    const d = todayDateOnly()
    expect(d.getUTCDate()).toBe(11)
  })
})

describe('toDateOnlyString', () => {
  it('把 @db.Date 读出的 UTC 零点 Date 转成 YYYY-MM-DD', () => {
    // Prisma 从 date 列读出的是 UTC 零点 Date，toISOString 前 10 位即存储日期。
    expect(toDateOnlyString(new Date('2026-11-11T00:00:00.000Z'))).toBe('2026-11-11')
  })

  it('不受本地时区影响', () => {
    // UTC 零点在任何时区 toISOString 都是同一天。
    const d = new Date(Date.UTC(2026, 0, 1))
    expect(toDateOnlyString(d)).toBe('2026-01-01')
  })
})
