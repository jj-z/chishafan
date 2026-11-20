// app/composables/useHistory.ts
// 就餐历史相关的共享状态：记录「就吃它」（HIST-03），以及今天已吃的菜品集合。
// 首页与详情页用 isEatenToday 把按钮置灰。

import { historyOkSchema, historyTodaySchema } from '#shared/schemas/history'

export function useHistory() {
  const { session, requireLogin } = useAuth()
  const eatenTodayIds = useState<string[]>('app-eaten-today', () => [])
  const loaded = useState<boolean>('app-eaten-today-loaded', () => false)

  /** 拉取今天已吃的菜品 id。未登录时清空（游客没有历史）。force=true 用于主动刷新。 */
  async function loadEatenToday(force = false) {
    if (!session.loggedIn.value) {
      eatenTodayIds.value = []
      loaded.value = false
      return
    }
    if (loaded.value && !force) return
    const data = await apiFetch('/api/history/today', historyTodaySchema)
    eatenTodayIds.value = data.dishIds
    loaded.value = true
  }

  /** 今天是否吃过某道菜。 */
  function isEatenToday(dishId: string): boolean {
    return eatenTodayIds.value.includes(dishId)
  }

  /**
   * 「就吃它」：把一餐里的每道菜写入历史。需要登录。
   * 成功后本地把今天已吃集合补上，按钮立刻置灰，不必等下次请求。
   */
  async function recordEaten(dishIds: string[]): Promise<boolean> {
    if (!requireLogin()) return false
    await apiFetch('/api/history', historyOkSchema, {
      method: 'POST',
      body: { dishIds },
    })
    eatenTodayIds.value = [...new Set([...eatenTodayIds.value, ...dishIds])]
    loaded.value = true
    return true
  }

  /** 退出登录或切换账号时清空，防止上一个账号的数据残留。 */
  function clearHistory() {
    eatenTodayIds.value = []
    loaded.value = false
  }

  return { eatenTodayIds, loaded, loadEatenToday, isEatenToday, recordEaten, clearHistory }
}
