// packages/core/src/composables/useRandomDish.ts

import { ref, type Ref } from 'vue'
import type { Dish, MealTime } from '../types'

/**
 * 随机推荐菜品的纯逻辑 composable
 * 可在 Web、小程序、SSR 中直接复用，无任何平台依赖
 *
 * @param dishes 待推荐的菜品列表（响应式或普通数组）
 * @param options.mealTime 可选，按餐时过滤
 * @returns current 当前随机菜品, pick 手动刷新方法
 */
export function useRandomDish(
  dishes: Ref<Dish[]> | Dish[],
  options?: { mealTime?: MealTime }
) {
  // 确保拿到的是响应式数组
  const source = Array.isArray(dishes) ? ref(dishes) : dishes

  const current = ref<Dish | null>(null)

  function pick() {
    let pool = source.value

    // 如果指定了餐时，先过滤
    if (options?.mealTime) {
      pool = pool.filter((d) => d.mealTime === options.mealTime)
    }

    if (pool.length === 0) {
      current.value = null
      return
    }

    const index = Math.floor(Math.random() * pool.length)
    current.value = pool[index]
  }

  // 初始化时自动推荐一次
  pick()

  return { current, pick }
}