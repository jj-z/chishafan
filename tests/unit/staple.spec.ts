// 主食池加权逻辑（MEAL-05）：用固定随机数验证权重区间，避免测试本身随机抖动。

import { afterEach, describe, expect, it, vi } from 'vitest'
import { pickStaple, STAPLE_POOL } from '../../shared/utils/dish'

describe('pickStaple', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('早餐只从粥/馒头/饼中选，不会出现米饭', () => {
    // 遍历 0~0.99，确保任何随机值都落在早餐池内。
    for (let i = 0; i < 100; i++) {
      vi.spyOn(Math, 'random').mockReturnValue(i / 100)
      expect(['粥', '馒头', '饼']).toContain(pickStaple(undefined, 'BREAKFAST'))
    }
  })

  it('面食分类会命中面条/馒头/饼，而不是固定米饭', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(pickStaple('c-noodle', 'LUNCH')).toBe('面条')
  })

  it('未知分类回退到通用池，随机值 0 时是米饭', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(pickStaple('c-unknown', 'DINNER')).toBe('米饭')
  })

  it('任何情况下返回值都属于全局主食池', () => {
    for (let i = 0; i < 50; i++) {
      vi.spyOn(Math, 'random').mockReturnValue(i / 50)
      expect(STAPLE_POOL).toContain(pickStaple('c-bbq', 'DINNER'))
    }
  })
})
