// app/composables/useSearchHistory.ts
// 菜品搜索历史（P2-10）：只存在本机 localStorage，不上传服务端。
//
// 为什么不做跨设备同步：搜索词属于轻量本机偏好，为它建表/接口收益很低；
// 换成登录同步还需要处理多端合并与隐私删除，超出本阶段范围。
// 最多 10 条，重复搜索去重并置顶，用户可一键清空。

const STORAGE_KEY = 'chishafan:dish-search-history'
const MAX_ITEMS = 10

export function useSearchHistory() {
  // useState 让页面 KeepAlive 切换时共享同一份历史，避免来回切 tab 重新读盘
  const history = useState<string[]>('dish-search-history', () => [])
  const hydrated = useState<boolean>('dish-search-history-hydrated', () => false)

  /** localStorage 可能被隐私模式禁用或写满，失败时只影响持久化，不影响本次搜索。 */
  function persist() {
    if (!import.meta.client) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history.value))
    } catch {
      // 忽略：无痕模式下写入会抛错，本次会话内的历史仍然可用
    }
  }

  /** 首次使用时从 localStorage 恢复；hydrated 标记避免 KeepAlive 反复读取覆盖新记录。 */
  function loadSearchHistory() {
    if (!import.meta.client || hydrated.value) return
    hydrated.value = true
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        history.value = parsed
          .filter((item): item is string => typeof item === 'string')
          .slice(0, MAX_ITEMS)
      }
    } catch {
      // 旧数据损坏时直接当作没有历史，下一次搜索会重新写入
    }
  }

  /** 记录一条搜索词：去首尾空格、按不区分大小写去重、最新置顶、最多 10 条。 */
  function rememberSearch(keyword: string) {
    const term = keyword.trim().slice(0, 50)
    if (!term) return
    history.value = [
      term,
      ...history.value.filter((item) => item.toLowerCase() !== term.toLowerCase()),
    ].slice(0, MAX_ITEMS)
    persist()
  }

  /** 清空历史：同时清 localStorage，避免刷新后又回来。 */
  function clearSearchHistory() {
    history.value = []
    persist()
  }

  return { history, loadSearchHistory, rememberSearch, clearSearchHistory }
}
