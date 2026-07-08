// 餐时分类
export type MealTime = 'breakfast' | 'lunch' | 'dinner' | 'supper' | 'teatime'

// 菜系（初期列举常见，后期可扩展）
export type Cuisine = '川菜' | '粤菜' | '湘菜' | '鲁菜' | '苏菜' | '闽菜' | '浙菜' | '徽菜' | '西餐' | '日料' | '韩餐' | '东南亚' | '其他'

// 口味
export type Taste = '辣' | '酸' | '甜' | '咸鲜' | '清淡' | '麻辣' | '酸甜'

// 难度
export type Difficulty = '简单' | '中等' | '困难'

// 用餐人数场景
export type MealScene = '单人' | '家庭' | '老人' | '儿童'

// 核心菜品接口
export interface Dish {
  id: string
  name: string
  mealTime: MealTime
  cuisine: Cuisine
  taste: Taste[]
  ingredients: string[]     // 食材库动态扩展，暂用 string
  allergens: string[]       // 同上，或可定义联合类型
  calories: number
  price: number
  difficulty: Difficulty
  cookingTime: number
  image?: string
  description?: string
  scene?: MealScene[]       // 可选：适合什么场景
}