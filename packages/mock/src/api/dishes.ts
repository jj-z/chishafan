import type { ApiResponse, Dish, MealTime } from '@chisha/core'
import { mockDishes } from '../data/dishes'

function delay(ms = 200): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 模拟随机推荐接口
 */
export async function fetchRandomDish(mealTime?: MealTime): Promise<ApiResponse<Dish>> {
  await delay()
  let pool = mockDishes
  if (mealTime) {
    pool = pool.filter(d => d.mealTime === mealTime)
  }
  if (pool.length === 0) {
    return { code: 404, message: '没有找到菜品', data: null as any }
  }
  const index = Math.floor(Math.random() * pool.length)
  return { code: 200, message: '成功', data: pool[index] }
}

// 可以继续添加 fetchAllDishes、fetchDishById 等