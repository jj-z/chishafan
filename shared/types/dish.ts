// 前后端共享的领域类型。服务端接口返回值、前端组件、mock 数据都必须复用这里，
// 禁止在页面或 mock 文件里重复声明一份。

export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'ANY'

/** 单品即一餐（SINGLE）还是需要搭配主食的菜（DISH），见 domain MEAL-03。 */
export type ServingMode = 'SINGLE' | 'DISH'

/** 配菜在一餐里的角色，只有 DISH 才有意义。 */
export type DishRole = 'MAIN' | 'VEG' | 'SOUP'

/**
 * 受控过敏原/忌口标签。
 * 这里是前后端与 Prisma 枚举共用的唯一代码来源：
 * - Prisma 的 Allergen 枚举必须与本数组完全一致；
 * - Zod 用 z.enum(ALLERGEN_CODES) 推导；
 * - 中文名统一放 shared/utils/dish.ts 的 ALLERGEN_LABELS。
 */
export const ALLERGEN_CODES = [
  'PEANUT',
  'TREE_NUT',
  'SEAFOOD',
  'FISH',
  'BEEF',
  'LAMB',
  'PORK',
  'POULTRY',
  'EGG',
  'DAIRY',
  'GLUTEN',
  'SOY',
  'SESAME',
  'ALCOHOL',
] as const

export type Allergen = (typeof ALLERGEN_CODES)[number]

export interface Category {
  id: string
  name: string
}

export interface Dish {
  id: string
  name: string
  description: string
  imageUrl: string
  mealType: MealType
  categoryId: string
  servingMode: ServingMode
  role?: DishRole
  /** 辣度 0-3 */
  spicyLevel: number
  /** 价格档位 1-3 */
  priceLevel: number
  tags: string[]
  ingredients: string[]
  steps: string
}

/** 推荐结果：一餐。组合餐带主食，单品餐不带。 */
export interface Meal {
  kind: 'SINGLE' | 'COMBO'
  dishes: Dish[]
  staple?: string
}
