// app/composables/useFavorites.ts
// 收藏相关的共享状态与操作。登录后首次进入收藏页才拉取，切 tab 不重复请求；
// 但「重新进入收藏页」（KeepAlive onActivated）会强制刷新，保证与后端一致。

import { favoriteListResultSchema, favoriteOkSchema } from '#shared/schemas/favorite'
import type { DishDetail } from '#shared/schemas/dish'

export function useFavorites() {
  const { session, requireLogin } = useAuth()
  const dishes = useState<DishDetail[]>('app-favorites', () => [])
  const loaded = useState<boolean>('app-favorites-loaded', () => false)

  /**
   * 拉取当前用户的收藏列表。未登录时直接返回（游客没有收藏）。
   * force=true 用于重新进入收藏页时刷新，避免 KeepAlive 缓存了旧数据。
   */
  async function loadFavorites(force = false) {
    if (!session.loggedIn.value) {
      dishes.value = []
      loaded.value = false
      return
    }
    if (loaded.value && !force) return
    const data = await apiFetch('/api/favorites', favoriteListResultSchema, {
      query: { page: 1, pageSize: 50 },
    })
    dishes.value = data.items.map((item) => item.dish)
    loaded.value = true
  }

  /** 当前是否已收藏。收藏列表是页面级状态，直接查本地数组即可。 */
  function isFavorite(dishId: string): boolean {
    return dishes.value.some((d) => d.id === dishId)
  }

  /**
   * 收藏 / 取消收藏（由卡片和详情页共用）。需要登录，未登录会走跳转登录。
   * 成功后本地同步数组，避免整页重新拉取；返回操作后的收藏状态。
   */
  async function toggleFavorite(dish: DishDetail): Promise<boolean> {
    if (!requireLogin()) return false
    const already = isFavorite(dish.id)
    const data = await apiFetch(`/api/favorites/${dish.id}`, favoriteOkSchema, {
      method: already ? 'DELETE' : 'PUT',
    })
    if (data.favorite && !already) {
      dishes.value = [dish, ...dishes.value]
    } else if (!data.favorite && already) {
      dishes.value = dishes.value.filter((d) => d.id !== dish.id)
    }
    return data.favorite
  }

  /** 退出登录或切换账号时清空本地收藏，防止上一个账号的数据残留。 */
  function clearFavorites() {
    dishes.value = []
    loaded.value = false
  }

  return { dishes, loaded, loadFavorites, isFavorite, toggleFavorite, clearFavorites }
}
