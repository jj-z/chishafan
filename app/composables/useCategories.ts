// app/composables/useCategories.ts
// 分类列表共享状态。首页 / 菜品库 / 详情 / 卡片都要展示分类，只向服务端请求一次；
// 配合页面 KeepAlive，切 tab 不会重复拉取。

import { z } from 'zod'
import { categorySchema } from '#shared/schemas/dish'

export function useCategories() {
  const categories = useState<z.infer<typeof categorySchema>[]>('app-categories', () => [])
  const loaded = useState<boolean>('app-categories-loaded', () => false)

  /** 加载分类。force=true 时忽略已加载标记，用于显式刷新。 */
  async function loadCategories(force = false) {
    if (loaded.value && !force) return
    categories.value = await apiFetch('/api/categories', z.array(categorySchema))
    loaded.value = true
  }

  /** 根据分类 id 反查名称，找不到时给兜底文案（分类可能刚被下架）。 */
  function categoryName(id: string): string {
    return categories.value.find((c) => c.id === id)?.name ?? '未分类'
  }

  return { categories, loaded, loadCategories, categoryName }
}
