// 用户口味偏好契约：前后端共用，页面表单与 /api/preferences 必须使用同一份 schema。
//
// 语义约定（对应 domain PREF-01~04）：
// - likedCategoryIds：喜欢菜系，推荐时提高权重；
// - dislikedCategoryIds：不喜欢菜系，推荐时降低权重，但不排除；
// - allergens：忌口/过敏原，硬过滤，命中即不推荐；
// - spicyMax：辣度上限，硬约束；
// - priceMax：价格上限，软约束（超出只降权，避免候选池被筛空）。

import { z } from 'zod'
import { allergenEnum } from './dish'

/** 菜系 id 列表，服务端只校验格式，菜系是否存在由前端从 /api/categories 取值保证。 */
const categoryIdList = z.array(z.string().min(1)).max(50)

export const preferenceSchema = z
  .object({
    likedCategoryIds: categoryIdList,
    dislikedCategoryIds: categoryIdList,
    allergens: z.array(allergenEnum),
    spicyMax: z.number().int().min(0).max(3),
    priceMax: z.number().int().min(1).max(3),
  })
  .refine((data) => !data.likedCategoryIds.some((id) => data.dislikedCategoryIds.includes(id)), {
    message: '喜欢和不喜欢不能选择同一个菜系',
    path: ['dislikedCategoryIds'],
  })

/** 未设置偏好时的默认值：不忌口、不限制辣度与价格，保证推荐结果与一期一致。 */
export const DEFAULT_PREFERENCE: Preference = {
  likedCategoryIds: [],
  dislikedCategoryIds: [],
  allergens: [],
  spicyMax: 3,
  priceMax: 3,
}

export type Preference = z.infer<typeof preferenceSchema>
