// 收藏相关的请求/响应契约，与 docs/domain.md FAV-01~03 对齐。

import { z } from 'zod'
import { pageResultSchema } from './common'
import { dishSchema } from './dish'

export const favoritesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
})

/** 收藏列表项：菜品 + 收藏时间（ISO 串），按收藏先后倒序。 */
export const favoriteItemSchema = z.object({
  dish: dishSchema,
  createdAt: z.string(),
})

export const favoriteListResultSchema = pageResultSchema(favoriteItemSchema)

/** 收藏/取消收藏的响应：favorite=true 表示当前已收藏（操作幂等，FAV-02）。 */
export const favoriteOkSchema = z.object({
  favorite: z.boolean(),
})

export type FavoritesQuery = z.infer<typeof favoritesQuerySchema>
export type FavoriteItem = z.infer<typeof favoriteItemSchema>
export type FavoriteListResult = z.infer<typeof favoriteListResultSchema>
export type FavoriteOk = z.infer<typeof favoriteOkSchema>
