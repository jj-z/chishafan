// 地域 / 天气软加权（PREF-06）：验证命中关系与倍率上限。

import { describe, expect, it } from 'vitest'
import { buildCategoryBias } from '../../server/utils/recommendBias'
import type { AmbientInfo } from '../../server/utils/ambient'

/** 构造环境信息，只需要 city/province/weather 三个字段。 */
function ambient(partial: Partial<AmbientInfo>): AmbientInfo {
  return { city: null, province: null, weather: null, ...partial }
}

describe('buildCategoryBias', () => {
  it('没有任何地域/天气信息时返回空映射（全部 ×1）', () => {
    expect(buildCategoryBias(ambient({}))).toEqual({})
  })

  it('四川会命中川菜加权', () => {
    const bias = buildCategoryBias(ambient({ province: '四川省', city: '成都' }))
    expect(bias['c-sichuan']).toBe(1.6)
  })

  it('地域 + 天气叠加后不超过 2.5 倍上限', () => {
    const overloaded = buildCategoryBias(
      ambient({
        province: '广东省',
        city: '广州',
        weather: { tempC: 5, text: '小雨', kind: 'RAIN' },
      }),
    )
    // 广东 1.3 × 雨天 1.5 = 1.95；浮点乘法要用 toBeCloseTo 比较。
    expect(overloaded['c-soup']).toBeCloseTo(1.95, 5)
    expect(Math.max(...Object.values(overloaded))).toBeLessThanOrEqual(2.5)
  })

  it('极端组合（多关键词 + 多天气）仍受 2.5 上限约束', () => {
    // 城市文本同时包含两个地域关键词，理论上会被叠加两次。
    const bias = buildCategoryBias(
      ambient({
        province: '广东 上海',
        city: '广州',
        weather: { tempC: 30, text: '炎热', kind: 'HOT' },
      }),
    )
    for (const value of Object.values(bias)) {
      expect(value).toBeLessThanOrEqual(2.5)
      expect(value).toBeGreaterThanOrEqual(1)
    }
  })
})
