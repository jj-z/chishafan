// 口味偏好契约与服务端判定（PREF-01 / PREF-05）。
// PREF-02/03 的硬过滤在 SQL 层实现，需要数据库才能测（见 e2e）；
// 这里覆盖纯逻辑部分：喜欢/不喜欢互斥校验、是否真正应用了偏好。

import { describe, expect, it } from 'vitest'
import { preferenceSchema, DEFAULT_PREFERENCE } from '../../shared/schemas/preference'
import { isPreferenceApplied } from '../../server/utils/preference'

describe('preferenceSchema（PREF-05）', () => {
  it('喜欢与不喜欢不能选同一个菜系', () => {
    const result = preferenceSchema.safeParse({
      likedCategoryIds: ['c-sichuan'],
      dislikedCategoryIds: ['c-sichuan'],
      allergens: [],
      spicyMax: 3,
      priceMax: 3,
    })
    expect(result.success).toBe(false)
  })

  it('喜欢和不喜欢不重叠时通过', () => {
    const result = preferenceSchema.safeParse({
      likedCategoryIds: ['c-sichuan'],
      dislikedCategoryIds: ['c-bbq'],
      allergens: [],
      spicyMax: 3,
      priceMax: 3,
    })
    expect(result.success).toBe(true)
  })

  it('辣度上限只允许 0~3', () => {
    expect(preferenceSchema.safeParse({ ...DEFAULT_PREFERENCE, spicyMax: -1 }).success).toBe(false)
    expect(preferenceSchema.safeParse({ ...DEFAULT_PREFERENCE, spicyMax: 4 }).success).toBe(false)
    expect(preferenceSchema.safeParse({ ...DEFAULT_PREFERENCE, spicyMax: 0 }).success).toBe(true)
  })

  it('价格上限只允许 1~3', () => {
    expect(preferenceSchema.safeParse({ ...DEFAULT_PREFERENCE, priceMax: 0 }).success).toBe(false)
    expect(preferenceSchema.safeParse({ ...DEFAULT_PREFERENCE, priceMax: 4 }).success).toBe(false)
  })

  it('过敏原只能是受控枚举值', () => {
    expect(
      preferenceSchema.safeParse({ ...DEFAULT_PREFERENCE, allergens: ['PEANUT'] }).success,
    ).toBe(true)
    expect(preferenceSchema.safeParse({ ...DEFAULT_PREFERENCE, allergens: ['花生'] }).success).toBe(
      false,
    )
  })
})

describe('isPreferenceApplied（PREF-01）', () => {
  it('默认偏好（不忌口、不限制）不算「已应用」', () => {
    expect(isPreferenceApplied(DEFAULT_PREFERENCE)).toBe(false)
  })

  it('只要有忌口或菜系偏好或限制辣度/价格就算已应用', () => {
    expect(isPreferenceApplied({ ...DEFAULT_PREFERENCE, allergens: ['PEANUT'] })).toBe(true)
    expect(isPreferenceApplied({ ...DEFAULT_PREFERENCE, likedCategoryIds: ['c-sichuan'] })).toBe(
      true,
    )
    expect(isPreferenceApplied({ ...DEFAULT_PREFERENCE, spicyMax: 1 })).toBe(true)
    expect(isPreferenceApplied({ ...DEFAULT_PREFERENCE, priceMax: 1 })).toBe(true)
  })
})
