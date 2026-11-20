// app/composables/useRecommendTracking.ts
// 推荐效果埋点队列（P2-09 / TRACK-01~04）。
//
// 设计要点：
// 1. 批量：2s 防抖或队列满 20 条才发请求，避免每次曝光都打一个接口；
// 2. 幂等：每条事件带前端生成的唯一 eventId，服务端按唯一键跳重；
// 3. 旁路：所有异常静默吞掉，埋点失败不能影响抽签、聊天与就餐记录（TRACK-04）；
// 4. 离页兜底：pagehide 时用 sendBeacon 把剩余队列发出去，避免用户秒关页面丢数据。

import type {
  RecommendEventInput,
  RecommendEventType,
  RecommendSource,
} from '#shared/schemas/tracking'
import { recommendEventsOkSchema } from '#shared/schemas/tracking'

const FLUSH_DELAY_MS = 2000
const FLUSH_THRESHOLD = 20
const MAX_BATCH = 50

let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushing = false
let unloadRegistered = false

/** 生成全局唯一事件 id：优先 crypto.randomUUID，老环境退回时间戳 + 随机数。 */
function createEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function useRecommendTracking() {
  // 用 useState 而不是模块级数组：多个组件（首页、聊天、DishCard）共享同一份队列，
  // 且不会在服务端渲染时把某个请求的数据串到另一个请求。
  const queue = useState<RecommendEventInput[]>('recommend-events-queue', () => [])

  /** 把队列按批发送；失败直接丢弃这一批，不做重试以免页面反复请求。 */
  async function flush(): Promise<void> {
    if (!import.meta.client || flushing || !queue.value.length) return
    flushing = true
    const batch = queue.value.slice(0, MAX_BATCH)
    queue.value = queue.value.slice(batch.length)
    try {
      await apiFetch('/api/tracking/recommend-events', recommendEventsOkSchema, {
        method: 'POST',
        body: { events: batch },
      })
    } catch {
      // 埋点是旁路能力：失败静默，禁止弹 toast 或阻塞页面（TRACK-04）。
    } finally {
      flushing = false
      if (queue.value.length) scheduleFlush()
    }
  }

  /** 延迟发送；已有定时器时复用，避免 2s 内多次曝光注册多个定时器。 */
  function scheduleFlush(): void {
    if (!import.meta.client || flushTimer) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      void flush()
    }, FLUSH_DELAY_MS)
  }

  /** 入队并按阈值决定立即发送还是延迟发送。 */
  function enqueue(type: RecommendEventType, dishIds: string[], source: RecommendSource): void {
    if (!import.meta.client) return
    // 同一餐里理论上不会重复，但去重能避免一份曝光被计两次。
    const uniqueIds = [...new Set(dishIds)]
    if (!uniqueIds.length) return

    for (const dishId of uniqueIds) {
      queue.value.push({ eventId: createEventId(), type, source, dishId })
    }

    if (queue.value.length >= FLUSH_THRESHOLD) {
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      void flush()
      return
    }
    scheduleFlush()
  }

  /** 页面隐藏/关闭时用 sendBeacon 发剩余队列：它不等待响应，适合卸载阶段。 */
  function flushOnPageHide(): void {
    if (!import.meta.client || !queue.value.length) return
    const batch = queue.value.slice(0, MAX_BATCH)
    queue.value = []
    try {
      const blob = new Blob([JSON.stringify({ events: batch })], { type: 'application/json' })
      // sendBeacon 同源请求会自带 cookie，服务端仍能识别登录用户。
      navigator.sendBeacon('/api/tracking/recommend-events', blob)
    } catch {
      // 忽略：离页阶段没有机会补救，也不能让卸载流程报错。
    }
  }

  // pagehide 只注册一次：多个组件各调一次 composable 不应重复挂监听。
  if (import.meta.client && !unloadRegistered) {
    unloadRegistered = true
    window.addEventListener('pagehide', flushOnPageHide)
  }

  return {
    trackImpressions: (dishIds: string[], source: RecommendSource) =>
      enqueue('IMPRESSION', dishIds, source),
    trackClick: (dishId: string, source: RecommendSource) => enqueue('CLICK', [dishId], source),
    trackDine: (dishIds: string[], source: RecommendSource) => enqueue('DINE', dishIds, source),
    flushRecommendEvents: flush,
  }
}
