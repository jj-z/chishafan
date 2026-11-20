import type { Allergen, DishRole, MealType, ServingMode } from '#shared/types/dish'

// 与展示相关的纯常量。放在 shared 而不是 mock，因为真实接口接入后仍然要用。

export const MEAL_LABELS: Record<MealType, string> = {
  BREAKFAST: '早餐',
  LUNCH: '午餐',
  DINNER: '晚餐',
  ANY: '随时',
}

export const SERVING_LABELS: Record<ServingMode, string> = {
  SINGLE: '单品一餐',
  DISH: '配菜',
}

export const ROLE_LABELS: Record<DishRole, string> = {
  MAIN: '主菜',
  VEG: '素菜',
  SOUP: '汤',
}

/** 辣度 0-3 的展示文案，后台表单与偏好页共用，避免两处各写一份。 */
export const SPICY_LABELS = ['不辣', '微辣', '中辣', '特辣'] as const

/** 价格档位 1-3 的展示文案。 */
export const PRICE_LABELS = ['¥', '¥¥', '¥¥¥'] as const

/** 过敏原代码到中文展示名。后台多选、偏好页勾选、菜品详情都复用它。 */
export const ALLERGEN_LABELS: Record<Allergen, string> = {
  PEANUT: '花生',
  TREE_NUT: '坚果',
  SEAFOOD: '海鲜（虾蟹贝）',
  FISH: '鱼类',
  BEEF: '牛肉',
  LAMB: '羊肉',
  PORK: '猪肉',
  POULTRY: '禽肉',
  EGG: '蛋类',
  DAIRY: '奶制品',
  GLUTEN: '麸质',
  SOY: '大豆',
  SESAME: '芝麻',
  ALCOHOL: '酒精',
}

// ── 主食池（MEAL-05）──────────────────────────────────────────────────
// 主食不是 Dish 记录，不参与搜索、收藏、历史与去重；这里只维护可展示的搭配。
// 权重按「菜系/餐别 → 主食」的经验搭配给出，权重越大越容易被抽中。

export interface StapleOption {
  name: string
  weight: number
}

/** 全局主食池：新增主食只需要改这里，不涉及数据库迁移。 */
export const STAPLE_POOL = ['米饭', '馒头', '面条', '粥', '饼'] as const

const DEFAULT_STAPLES: StapleOption[] = [
  { name: '米饭', weight: 0.75 },
  { name: '馒头', weight: 0.15 },
  { name: '面条', weight: 0.1 },
]

const STAPLES_BY_CATEGORY: Record<string, StapleOption[]> = {
  // 川菜/家常/快餐仍以米饭为主，面食概率略低
  'c-sichuan': [
    { name: '米饭', weight: 0.9 },
    { name: '面条', weight: 0.1 },
  ],
  'c-home': [
    { name: '米饭', weight: 0.8 },
    { name: '馒头', weight: 0.2 },
  ],
  'c-fast': [
    { name: '米饭', weight: 0.85 },
    { name: '面条', weight: 0.15 },
  ],
  // 面食分类配馒头/饼/面条更自然
  'c-noodle': [
    { name: '面条', weight: 0.45 },
    { name: '馒头', weight: 0.35 },
    { name: '饼', weight: 0.2 },
  ],
  // 汤粥类优先配粥或米饭
  'c-soup': [
    { name: '粥', weight: 0.6 },
    { name: '米饭', weight: 0.4 },
  ],
  'c-bbq': [
    { name: '馒头', weight: 0.45 },
    { name: '饼', weight: 0.35 },
    { name: '米饭', weight: 0.2 },
  ],
}

const BREAKFAST_STAPLES: StapleOption[] = [
  { name: '粥', weight: 0.45 },
  { name: '馒头', weight: 0.3 },
  { name: '饼', weight: 0.25 },
]

/** 按权重随机取一个主食。权重为 0 或负数视为不参与，全部无效时回退米饭。 */
function pickWeighted(options: StapleOption[]): string {
  const valid = options.filter((o) => o.weight > 0)
  const total = valid.reduce((sum, o) => sum + o.weight, 0)
  if (!valid.length || total <= 0) return '米饭'
  let roll = Math.random() * total
  for (const option of valid) {
    roll -= option.weight
    if (roll <= 0) return option.name
  }
  return valid[valid.length - 1]!.name
}

/**
 * 选主食。早餐优先粥/馒头/饼，其余按主菜所属菜系匹配；
 * 未命中分类时回退到通用的米饭/馒头/面条池。
 */
export function pickStaple(categoryId?: string, mealType?: MealType): string {
  if (mealType === 'BREAKFAST') return pickWeighted(BREAKFAST_STAPLES)
  const byCategory = categoryId ? STAPLES_BY_CATEGORY[categoryId] : undefined
  return pickWeighted(byCategory ?? DEFAULT_STAPLES)
}
