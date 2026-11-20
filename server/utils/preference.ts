// 口味偏好的服务端读写。随机推荐与后续 AI 推荐都从这里取同一份数据，
// 禁止在接口里各自查表后再各写一套默认值。

import type { Preference } from '../../shared/schemas/preference'
import { DEFAULT_PREFERENCE } from '../../shared/schemas/preference'

/**
 * 读取用户偏好。没有记录时返回共享默认值（不忌口、无偏好），
 * 而不是在数据库里给每个新用户预插一行，避免注册链路承担额外写入。
 */
export async function loadPreference(userId: string): Promise<Preference> {
  const row = await prisma.userPreference.findUnique({ where: { userId } })
  if (!row) return DEFAULT_PREFERENCE
  return {
    likedCategoryIds: row.likedCategoryIds,
    dislikedCategoryIds: row.dislikedCategoryIds,
    allergens: row.allergens,
    spicyMax: row.spicyMax,
    priceMax: row.priceMax,
  }
}

/**
 * 判断这份偏好是否会实际改变推荐结果。
 * 用于前端展示「已按你的口味偏好推荐」，默认值（不忌口、不限制）不算应用。
 */
export function isPreferenceApplied(preference: Preference): boolean {
  return (
    preference.allergens.length > 0 ||
    preference.likedCategoryIds.length > 0 ||
    preference.dislikedCategoryIds.length > 0 ||
    preference.spicyMax < 3 ||
    preference.priceMax < 3
  )
}
