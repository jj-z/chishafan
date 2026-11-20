// app/composables/useFeedback.ts
// 「不感兴趣」的标记与撤销（PREF-11）。首页推荐结果与「我的 → 不感兴趣的菜」共用，
// 避免两个页面各写一套请求与错误处理。

import { feedbackOkSchema } from '#shared/schemas/feedback'

export function useFeedback() {
  const { requireLogin } = useAuth()

  /**
   * 标记不感兴趣。需要登录：游客没有账号承载长期偏好，未登录时 requireLogin
   * 会跳登录页并带上 redirect，返回 false 让调用方停止后续 UI 更新。
   */
  async function dislikeDish(dishId: string): Promise<boolean> {
    if (!requireLogin()) return false
    await apiFetch('/api/feedback', feedbackOkSchema, {
      method: 'POST',
      body: { dishId },
    })
    return true
  }

  /** 撤销不感兴趣（幂等）：记录不存在也返回成功，页面可以直接从列表移除。 */
  async function undoDislike(dishId: string): Promise<void> {
    await apiFetch(`/api/feedback/${dishId}`, feedbackOkSchema, { method: 'DELETE' })
  }

  return { dislikeDish, undoDislike }
}
