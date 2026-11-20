// app/composables/useAdmin.ts
// 管理后台两个页面（菜品管理 / 分类管理）共用的逻辑：错误文案提取、分类下拉数据、时间展示格式。
// 抽到一处是为了避免两个页面各写一份，后续改文案或时间格式时漏改其中一边。

import { adminCategoryListSchema } from '#shared/schemas/admin'
import type { AdminCategory } from '#shared/schemas/admin'

/**
 * 从 $fetch 抛出的错误里取出服务端文案，取不到时返回调用方给的兜底文案。
 * Nitro 会把 createError 的 statusMessage 放到 err.data.statusMessage；
 * 网络异常时只有 err.message，所以这里按优先级依次兜底。
 */
export function adminErrorMessage(err: unknown, fallback: string): string {
  const e = err as {
    data?: { statusMessage?: string; message?: string }
    statusMessage?: string
    message?: string
  }
  return e?.data?.statusMessage || e?.data?.message || e?.statusMessage || fallback
}

/** 后台分类数据：列表页的下拉筛选、菜品编辑弹窗、分类名称反查都会用到。 */
export function useAdminCategories() {
  const categories = ref<AdminCategory[]>([])

  /** 拉取全部未删除分类（含 sortOrder）。分类量很小，后台不缓存，每次进页面重新取保证最新。 */
  async function loadCategories() {
    categories.value = await apiFetch('/api/admin/categories', adminCategoryListSchema)
  }

  /** 分类 id → 名称。菜品引用分类被删除后仍可能短暂展示，找不到时给占位文案而不是空白。 */
  function categoryName(id: string): string {
    return categories.value.find((c) => c.id === id)?.name ?? '未知分类'
  }

  return { categories, loadCategories, categoryName }
}

/**
 * ISO 时间 → 本地「YYYY-MM-DD HH:mm」。
 * 为什么不直接用 toLocaleString：不同浏览器/系统区域的输出格式不一致，
 * 表格里固定成短格式既能一屏放下，也不会因区域设置变化而换行。
 */
export function formatAdminDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
