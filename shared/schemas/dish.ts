// 菜品/一餐相关的请求与响应契约。
// 注意：description / imageUrl / steps 与 Prisma Dish 模型一致是可空的
// （旧 shared/types/dish.ts 把它们声明为非空，那是 mock 展示用的宽松类型，接口契约以这里为准）。

import { z } from 'zod'
import { ALLERGEN_CODES } from '../types/dish'
import { pageResultSchema } from './common'

export const mealTypeEnum = z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'ANY'])
export const servingModeEnum = z.enum(['SINGLE', 'DISH'])
export const dishRoleEnum = z.enum(['MAIN', 'VEG', 'SOUP'])
/** 受控过敏原枚举；代码来源在 shared/types/dish.ts，避免前后端与 Prisma 三处各写一遍。 */
export const allergenEnum = z.enum(ALLERGEN_CODES)

/** 一道菜的完整领域对象，接口返回与前端接收共用这一份。 */
export const dishSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  mealType: mealTypeEnum,
  categoryId: z.string(),
  servingMode: servingModeEnum,
  role: dishRoleEnum,
  spicyLevel: z.number().int(),
  priceLevel: z.number().int(),
  tags: z.array(z.string()),
  ingredients: z.array(z.string()),
  /** 受控过敏原，用户偏好里的忌口按它做硬过滤（PREF-02）。 */
  allergens: z.array(allergenEnum),
  steps: z.string().nullable(),
})

export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
})

/** 一餐：SINGLE 单品餐 / COMBO 组合餐（主食 + 1~3 道菜），见 domain MEAL-01~06。 */
export const mealSchema = z.object({
  kind: z.enum(['SINGLE', 'COMBO']),
  dishes: z.array(dishSchema),
  staple: z.string().optional(),
})

/**
 * excludeIds 在 URL 里是逗号拼接的字符串（如 excludeIds=d1,d2）。
 * 为什么不用数组：$fetch 序列化数组的格式不稳定（可能是 a,b 也可能是 a[]=…），
 * 统一成逗号字符串后前后端解析规则明确，不需要依赖第三方序列化约定。
 */
const excludeIdsSchema = z.preprocess((val) => {
  if (val === undefined || val === null || val === '') return undefined
  if (Array.isArray(val)) return val.map(String)
  return String(val)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}, z.array(z.string()).optional())

/**
 * includeRecent 在 URL 里只会是字符串。
 * 为什么不用 z.coerce.boolean()：它把任意非空字符串都转成 true，'false' 也会变 true，
 * 这里显式只认 'true' / '1'。
 */
const includeRecentSchema = z.preprocess(
  (val) => val === 'true' || val === '1' || val === true,
  z.boolean(),
)

/**
 * 去重窗口（天）：0 表示不按历史去重，3 / 7 / 14 表示排除近 N 天吃过的菜。
 * 不传时沿用服务端默认值（环境变量 HISTORY_DAYS，默认 3），旧客户端行为保持不变。
 * 前端只能在首页筛选里选有限几档，所以上限 30 足够，也避免有人传 3650 把去重变成永久排除。
 */
const historyDaysSchema = z.coerce.number().int().min(0).max(30).optional()

/** 随机推荐查询参数：筛选、excludeIds（DISH-04）、includeRecent / historyDays（DISH-05）。 */
export const randomQuerySchema = z.object({
  mealType: mealTypeEnum.optional(),
  categoryId: z.string().optional(),
  excludeIds: excludeIdsSchema,
  includeRecent: includeRecentSchema,
  historyDays: historyDaysSchema,
})

/**
 * 天气类型：服务端把第三方天气文案归一成有限枚举，
 * 前端只负责展示，推荐权重也按这个枚举计算，避免直接依赖外部文案。
 */
export const weatherKindEnum = z.enum(['HOT', 'COLD', 'RAIN', 'SNOW', 'MILD', 'UNKNOWN'])

/** 推荐环境：城市与天气。任一字段为 null 都表示外部服务不可用，推荐流程必须继续。 */
export const ambientSchema = z.object({
  city: z.string().nullable(),
  weather: z
    .object({
      tempC: z.number(),
      text: z.string(),
      kind: weatherKindEnum,
    })
    .nullable(),
})

/**
 * 随机推荐响应。degraded=true 表示候选池曾被筛空、服务端已丢弃 excludeIds 重新抽
 * （前端拿到后要同步清空本地去重记录，否则下一次还是空转）。meal 为 null 表示
 * 当前筛选下连降级都抽不出来（例如该分类还没有已发布的菜）。
 * preferenceApplied=true 表示本次结果应用了登录用户的口味偏好（忌口/菜系/辣度等）。
 */
export const randomResultSchema = z.object({
  meal: mealSchema.nullable(),
  degraded: z.boolean(),
  ambient: ambientSchema,
  preferenceApplied: z.boolean(),
})

/**
 * 菜品列表查询参数：分类筛选 + 关键词搜索 + 分页。
 * keyword 用 trim 去掉首尾空格，并限制 50 字：搜索词过长既没有意义，
 * 也会让 ILIKE 的匹配串变得很低效（DISH-03 只要求菜名模糊匹配，不做拼音）。
 */
export const dishesQuerySchema = z.object({
  categoryId: z.string().optional(),
  keyword: z.string().trim().max(50, '搜索词最多 50 字').optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
})

/** 动态路由参数（/api/dishes/:id 与 /api/favorites/:id）。 */
export const dishParamsSchema = z.object({
  id: z.string().min(1),
})

export const dishListResultSchema = pageResultSchema(dishSchema)

/**
 * 空结果兜底的热门菜（P2-10）。
 * 单独定义而不是复用分页结果：兜底只需要菜品数组，没有分页语义，
 * 前端拿到后直接铺成卡片，不必凑 total/page 等无意义字段。
 */
export const popularDishesResultSchema = z.object({
  items: z.array(dishSchema),
})

export type MealType = z.infer<typeof mealTypeEnum>
export type ServingMode = z.infer<typeof servingModeEnum>
export type DishRole = z.infer<typeof dishRoleEnum>
export type DishDetail = z.infer<typeof dishSchema>
export type Category = z.infer<typeof categorySchema>
export type Meal = z.infer<typeof mealSchema>
export type RandomQuery = z.infer<typeof randomQuerySchema>
export type RandomResult = z.infer<typeof randomResultSchema>
export type WeatherKind = z.infer<typeof weatherKindEnum>
export type Ambient = z.infer<typeof ambientSchema>
export type Allergen = z.infer<typeof allergenEnum>
export type DishesQuery = z.infer<typeof dishesQuerySchema>
export type DishListResult = z.infer<typeof dishListResultSchema>
export type PopularDishesResult = z.infer<typeof popularDishesResultSchema>
