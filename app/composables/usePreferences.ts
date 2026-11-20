// app/composables/usePreferences.ts
// 口味偏好的共享状态。偏好页保存后立即更新本地状态，
// 首页下一次抽签就能用到新偏好，不需要刷新页面。

import type { Preference } from '#shared/schemas/preference'
import { DEFAULT_PREFERENCE, preferenceSchema } from '#shared/schemas/preference'

/** 默认值的数组必须每次新建，避免多个调用方共享同一个数组引用后被互相修改。 */
function defaultPreference(): Preference {
  return {
    ...DEFAULT_PREFERENCE,
    likedCategoryIds: [],
    dislikedCategoryIds: [],
    allergens: [],
  }
}

export function usePreferences() {
  const { session } = useAuth()
  const preference = useState<Preference>('app-preference', defaultPreference)
  const loaded = useState<boolean>('app-preference-loaded', () => false)

  /**
   * 拉取偏好。未登录时回落默认值（游客不能保存偏好）。
   * force=true 用于重新进入偏好页时刷新，避免 KeepAlive/多标签页缓存旧数据。
   */
  async function loadPreference(force = false) {
    if (!session.loggedIn.value) {
      preference.value = defaultPreference()
      loaded.value = false
      return
    }
    if (loaded.value && !force) return
    preference.value = await apiFetch('/api/preferences', preferenceSchema)
    loaded.value = true
  }

  /** 保存偏好。服务端会再校验一次范围和互斥关系，前端不重复做业务校验。 */
  async function savePreference(next: Preference): Promise<void> {
    preference.value = await apiFetch('/api/preferences', preferenceSchema, {
      method: 'PUT',
      body: next,
    })
    loaded.value = true
  }

  /** 退出登录时清空，防止下一个账号看到上一个账号的口味。 */
  function clearPreference() {
    preference.value = defaultPreference()
    loaded.value = false
  }

  return { preference, loaded, loadPreference, savePreference, clearPreference }
}
