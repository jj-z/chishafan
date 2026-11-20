// 去重窗口解析（DISH-05 的优先级）：historyDays > includeRecent > 环境变量默认值。
// 这段逻辑决定「近几天吃过的菜不重复」，口径错了会直接影响推荐结果。

import { afterEach, describe, expect, it } from 'vitest'
import { resolveDedupeDays } from '../../server/utils/dish'

const original = process.env.HISTORY_DAYS

afterEach(() => {
  if (original === undefined) delete process.env.HISTORY_DAYS
  else process.env.HISTORY_DAYS = original
})

describe('resolveDedupeDays', () => {
  it('显式 historyDays 优先级最高，0 表示不去重', () => {
    process.env.HISTORY_DAYS = '7'
    expect(resolveDedupeDays({ historyDays: 0, includeRecent: false })).toBe(0)
    expect(resolveDedupeDays({ historyDays: 5, includeRecent: true })).toBe(5)
  })

  it('未传 historyDays 时，includeRecent=true 等于关闭去重', () => {
    expect(resolveDedupeDays({ includeRecent: true })).toBe(0)
  })

  it('什么都没有时读取 HISTORY_DAYS，非法值回退 3', () => {
    process.env.HISTORY_DAYS = '7'
    expect(resolveDedupeDays({})).toBe(7)

    process.env.HISTORY_DAYS = 'abc'
    expect(resolveDedupeDays({})).toBe(3)

    delete process.env.HISTORY_DAYS
    expect(resolveDedupeDays({})).toBe(3)
  })
})
