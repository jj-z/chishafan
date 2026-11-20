/**
 * 推荐去重窗口（天）：几天内吃过的菜不再出现在随机推荐里。
 *
 * 为什么放在 composable 而不是写进后端 UserPreference：
 * 用户要求这个设置放在「我的」页，它是个轻量展示偏好，
 * 为单个字段加 Prisma 迁移、schema 同步和接口改动成本不成比例。
 * 用 useState 让首页与「我的」页共享同一份响应式状态，
 * 再用 localStorage 持久化，刷新/重开浏览器后设置仍在。
 *
 * SSR 说明：useState 默认值 3 与服务端默认 HISTORY_DAYS 一致，
 * localStorage 只在客户端 onMounted 后读取，避免水合时两端值不一致。
 */

const STORAGE_KEY = 'app-history-days'
const VALID_DAYS = [0, 3, 7]

export function useHistoryDays() {
  const historyDays = useState<number>(STORAGE_KEY, () => 3)

  // 挂载后从 localStorage 恢复上次选择；非法值（手改存储）直接忽略回默认
  onMounted(() => {
    const saved = Number(localStorage.getItem(STORAGE_KEY))
    if (VALID_DAYS.includes(saved)) historyDays.value = saved
  })

  // 每次变化立即落盘，下次打开不用重新设置
  watch(historyDays, (value) => {
    localStorage.setItem(STORAGE_KEY, String(value))
  })

  return { historyDays }
}
