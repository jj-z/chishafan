// server/utils/dish.ts
// 菜品相关的服务端公共逻辑：统一的 Prisma select、把 Prisma 行映射成接口 DTO、
// 以及随机「一餐」的核心实现（domain MEAL-01~08）。

import { Prisma } from '../../shared/generated/prisma/client'
import type { AdminDish, DishWriteBody } from '../../shared/schemas/admin'
import type { DishDetail, Meal as MealDto } from '../../shared/schemas/dish'
import { pickStaple } from '../../shared/utils/dish'
import type { RecommendContext } from './recommend'

/** 返回给前端的菜品字段子集。刻意不含 deletedAt / isPublished / updatedAt，避免泄露内部状态。 */
export const dishSelect = {
  id: true,
  name: true,
  description: true,
  imageUrl: true,
  mealType: true,
  categoryId: true,
  servingMode: true,
  role: true,
  spicyLevel: true,
  priceLevel: true,
  tags: true,
  ingredients: true,
  allergens: true,
  steps: true,
} satisfies Prisma.DishSelect

/** 由 dishSelect 选出的 Prisma 行类型（Prisma 自动生成，避免手写重复定义）。 */
type DishRow = Prisma.DishGetPayload<{ select: typeof dishSelect }>

/** 把 Prisma 行转成接口契约里的 DishDetail。Prisma enum 与 Zod enum 同名字面值，可直接透传。 */
export function toDishDetail(row: DishRow): DishDetail {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    imageUrl: row.imageUrl,
    mealType: row.mealType,
    categoryId: row.categoryId,
    servingMode: row.servingMode,
    role: row.role,
    spicyLevel: row.spicyLevel,
    priceLevel: row.priceLevel,
    tags: row.tags,
    ingredients: row.ingredients,
    allergens: row.allergens,
    steps: row.steps,
  }
}

/**
 * 后台菜品字段子集：在用户端 dishSelect 基础上补充上架状态与时间戳。
 * 后台表格需要展示“是否上架”和更新时间，但用户端接口不能泄露这些内部状态，
 * 所以单独再定义一份，而不是改 dishSelect。
 */
export const adminDishSelect = {
  ...dishSelect,
  isPublished: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DishSelect

type AdminDishRow = Prisma.DishGetPayload<{ select: typeof adminDishSelect }>

/** Prisma 行 → 后台菜品 DTO（时间转 ISO 字符串，前端直接展示或格式化）。 */
export function toAdminDish(row: AdminDishRow): AdminDish {
  return {
    ...toDishDetail(row),
    isPublished: row.isPublished,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * 后台表单 → Prisma 写入数据。新增与编辑共用，保证两条路径写入的字段完全一致。
 * 可空字段把空字符串归一化成 null：否则数据库里会混着 '' 和 NULL 两种“空”。
 */
export function toDishWriteData(body: DishWriteBody) {
  return {
    name: body.name,
    categoryId: body.categoryId,
    description: body.description ? body.description : null,
    imageUrl: body.imageUrl ? body.imageUrl : null,
    mealType: body.mealType,
    servingMode: body.servingMode,
    role: body.role,
    spicyLevel: body.spicyLevel,
    priceLevel: body.priceLevel,
    tags: body.tags,
    ingredients: body.ingredients,
    allergens: body.allergens,
    steps: body.steps ? body.steps : null,
    isPublished: body.isPublished,
  }
}

export interface RandomFilters {
  mealType?: 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'ANY'
  categoryId?: string
  excludeIds?: string[]
  includeRecent?: boolean
  /** 用户可选的去重窗口（天）：0 = 不按历史去重；不传则用 HISTORY_DAYS 默认值。 */
  historyDays?: number
}

/** 「不感兴趣」的排除窗口（天），见 PREF-11：从反馈创建时间起算，过期自动恢复推荐。 */
const FEEDBACK_DAYS = 7

/**
 * 生成「排除近 7 天标记不感兴趣的菜」的 SQL 条件（PREF-11）。
 *
 * 为什么用子查询而不是先查 id 列表再拼 NOT IN：
 * 1. 少一次数据库往返，抽签本身已经要并行发 4 个查询；
 * 2. 条件与候选查询在同一条 SQL 里，避免两次查询之间反馈被撤销导致结果不一致。
 *
 * 只在登录时调用：游客没有 DishFeedback 记录，直接跳过可少拼一段 SQL。
 */
function dislikedDishExclusionSql(userId: string): Prisma.Sql {
  return Prisma.sql`
    d."id" NOT IN (
      SELECT f."dishId" FROM "dish_feedbacks" f
      WHERE f."userId" = ${userId}
        AND f."action" = 'DISLIKE'::"DishFeedbackAction"
        AND f."createdAt" >= (NOW() - (${FEEDBACK_DAYS} * INTERVAL '1 day'))
    )
  `
}

/** 最近 N 天吃过的菜要排除（DISH-05）。HISTORY_DAYS 默认 3。 */
function historyDays(): number {
  const raw = process.env.HISTORY_DAYS
  const n = raw ? Number.parseInt(raw, 10) : 3
  return Number.isFinite(n) && n > 0 ? n : 3
}

/**
 * 解析本次抽签实际使用的去重天数。
 * 优先级：显式 historyDays（用户可选窗口）> includeRecent（旧参数，true 等于关闭去重）> 环境变量默认值。
 * 返回 0 表示本次不按就餐历史排除。
 */
export function resolveDedupeDays(filters: RandomFilters): number {
  if (typeof filters.historyDays === 'number') return filters.historyDays
  return filters.includeRecent ? 0 : historyDays()
}

/**
 * 随机挑一餐。整体策略：
 * 1. 先按筛选条件在 DB 里取候选（SINGLE 池 + DISH 池分别做加权随机，每次各 1 条）；
 * 2. 按「单品餐 vs 组合餐」50/50 决定形态，缺哪边走另一边（MEAL-06）；
 * 3. 组合餐 = 1 主菜（必须）+ 可选素菜 + 可选汤（MEAL-04），主食按菜系从主食池加权选；
 * 4. excludeIds 把池子筛空后，丢弃 excludeIds 重抽，但近 N 天历史去重仍生效（DISH-04/08）；
 * 5. 忌口/过敏与辣度上限是硬约束，筛空后返回 null，禁止为了凑结果放宽（PREF-02/03）；
 * 6. 近 7 天标记「不感兴趣」的菜同样硬排除，降级轮也不恢复（PREF-11）。
 *
 * 性能说明（DISH-08）：RANDOM() 是全表扫描，千级以内无感；数据量上来后需要换成 id 段随机或 TABLESAMPLE。
 */
export async function pickRandomMeal(
  userId: string | null,
  filters: RandomFilters,
  context: RecommendContext,
): Promise<{ meal: MealDto | null; degraded: boolean }> {
  // 第一遍正常抽；第二遍只在 excludeIds 把池子抽干时触发（degraded=true）。
  for (let round = 0; round < 2; round++) {
    const degraded = round === 1
    // degraded 那轮丢弃 excludeIds，让全量候选重新参与；历史去重与忌口硬过滤保留。
    const excludeIds = degraded ? [] : (filters.excludeIds ?? [])
    const meal = await drawOnce(userId, filters, excludeIds, context)
    if (meal) return { meal, degraded }
  }
  return { meal: null, degraded: false }
}

/** 单次抽签。封装出来是为了让降级路径能复用同一套逻辑，只是 excludeIds 不同。 */
async function drawOnce(
  userId: string | null,
  filters: RandomFilters,
  excludeIds: string[],
  context: RecommendContext,
): Promise<MealDto | null> {
  // 每餐最多抽 4 个位置（单品 / 主菜 / 素菜 / 汤），并行下发以减少 RTT。
  // 实际形态可能要重抽（比如先抽中 SINGLE 又改走 COMBO），但 4 个查询已覆盖所有可能性。
  const [single, main, veg, soup] = await Promise.all([
    randomOne(userId, filters, excludeIds, context, 'SINGLE'),
    randomOne(userId, filters, excludeIds, context, 'DISH', 'MAIN'),
    randomOne(userId, filters, excludeIds, context, 'DISH', 'VEG'),
    randomOne(userId, filters, excludeIds, context, 'DISH', 'SOUP'),
  ])

  // 50/50 选择形态；某一边没有候选就走另一边（MEAL-06）。
  const wantSingle = Math.random() < 0.5
  if (wantSingle && single) {
    return { kind: 'SINGLE', dishes: [toDishDetail(single)] }
  }
  if (main) {
    const dishes: DishDetail[] = [toDishDetail(main)]
    // 素菜 60%、汤 40% 概率追加，组合餐最多 3 道菜（MEAL-04）。
    if (veg && Math.random() < 0.6) dishes.push(toDishDetail(veg))
    if (soup && Math.random() < 0.4) dishes.push(toDishDetail(soup))
    // 主食按主菜菜系与餐别从全局主食池加权选择，不是固定米饭（MEAL-05）。
    return { kind: 'COMBO', staple: pickStaple(main.categoryId, filters.mealType), dishes }
  }
  if (single) {
    return { kind: 'SINGLE', dishes: [toDishDetail(single)] }
  }
  return null
}

/** 把受控过敏原数组构造成 PostgreSQL 的 "Allergen"[]，避免 text[] 到 enum[] 的隐式转换失败。 */
function allergenArraySql(allergens: string[]): Prisma.Sql {
  return Prisma.sql`ARRAY[${Prisma.join(allergens.map((a) => Prisma.sql`${a}::"Allergen"`))}]`
}

/** AI 推荐候选菜品：只带拼 prompt 需要的精简字段，完整的 DishDetail 由最终 result 事件回查组装。 */
export interface RecommendCandidate {
  id: string
  name: string
  categoryId: string
  /** 餐别：recommend_dishes 工具按餐别筛选时要用（DISH-06）。 */
  mealType: string
  /** 单品/配菜形态：AI 组餐时据此决定是「单品即一餐」还是「主菜+配菜+主食」（MEAL-01/04）。 */
  servingMode: string
  /** 配菜角色：MAIN/VEG/SOUP，单品餐无意义。 */
  role: string
  spicyLevel: number
  priceLevel: number
  tags: string[]
  /**
   * 主要食材。必须放进 prompt：否则模型只知道「烧烤套餐」这个名字，
   * 就会顺着用户「想吃辣子鸡」的期待编出「套餐里有辣子鸡」（实测发生过的幻觉）。
   */
  ingredients: string[]
}

/**
 * 列出 AI 推荐可用的候选菜品（domain REC-01）。
 *
 * 硬过滤与随机推荐完全同一套规则（PREF-02/03 + DATA-01 + isPublished），
 * 禁止为 AI 单独放宽——模型只能从这份列表里挑，才能保证推荐的是真实存在的菜。
 * 登录用户默认排除近 N 天吃过的（DISH-05），但只对 AI 起到「尽量别重样」的软引导：
 * 若排除后候选为空则放弃历史排除重新取，忌口硬过滤始终保留。
 */
export async function listRecommendCandidates(
  userId: string | null,
  context: RecommendContext,
): Promise<{ candidates: RecommendCandidate[]; recentExcluded: boolean }> {
  const baseConditions: Prisma.Sql[] = [
    Prisma.sql`d."deletedAt" IS NULL`,
    Prisma.sql`d."isPublished" = true`,
    Prisma.sql`d."spicyLevel" <= ${context.preference.spicyMax}`,
  ]
  if (context.preference.allergens.length) {
    baseConditions.push(
      Prisma.sql`NOT (d."allergens" && ${allergenArraySql(context.preference.allergens)})`,
    )
  }
  // 近 7 天「不感兴趣」的菜不进候选（PREF-11）；放在 baseConditions 里，
  // 第二遍丢弃历史排除时也不会把用户明确拒绝的菜放回来。
  if (userId) baseConditions.push(dislikedDishExclusionSql(userId))

  const days = historyDays()
  const recentSql = Prisma.sql`
    d."id" NOT IN (
      SELECT h."dishId" FROM "dining_histories" h
      WHERE h."userId" = ${userId}
        AND h."eatenOn" >= (CURRENT_DATE - (${days} - 1) * INTERVAL '1 day')
    )
  `

  // 第一遍带历史排除；第二遍丢弃历史排除（近 N 天吃过的也能推荐，只是排在后面说清缘由）。
  for (const recentExcluded of [true, false]) {
    const conditions = [...baseConditions]
    if (userId && recentExcluded) conditions.push(recentSql)
    const rows = await prisma.$queryRaw<RecommendCandidate[]>(Prisma.sql`
      SELECT d."id", d."name", d."categoryId", d."mealType", d."servingMode", d."role",
             d."spicyLevel", d."priceLevel",
             ARRAY(SELECT t.x FROM unnest(d."tags") AS t(x)) AS "tags",
             ARRAY(SELECT t.x FROM unnest(d."ingredients") AS t(x)) AS "ingredients"
      FROM "dishes" d
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY d."categoryId", d."name"
    `)
    if (rows.length) return { candidates: rows, recentExcluded }
  }
  return { candidates: [], recentExcluded: false }
}

/**
 * 组装 SQL 权重表达式。
 *
 * 为什么不是简单的 ORDER BY RANDOM()：
 * 偏好、地域、天气都要求“软加权”，等概率会让所有配置失效。
 * 用 -LN(RANDOM()) / weight 做指数竞赛采样：权重越大，被抽中的概率越高，
 * 同时仍然由数据库生成随机数，满足修订后的 DISH-02。
 *
 * 权重来源（全部是软偏好）：
 * - 喜欢菜系 ×3，不喜欢菜系 ×0.2（喜欢优先）；
 * - 地域/天气菜系倍率（recommend.ts 计算，上限 2.5）；
 * - 超过价格上限 ×0.4（不硬排除，避免池子被预算筛空）；
 * - 高温天气下重辣菜 ×0.6；
 * - 近 7 天点过赞的菜 ×1.5（PREF-12：喜欢只软加权，不硬推，避免推荐池被点赞菜垄断）。
 */
function buildWeightSql(context: RecommendContext, userId: string | null): Prisma.Sql {
  const { preference } = context
  const factors: Prisma.Sql[] = []

  const userWhens: Prisma.Sql[] = []
  if (preference.likedCategoryIds.length) {
    userWhens.push(
      Prisma.sql`WHEN d."categoryId" IN (${Prisma.join(preference.likedCategoryIds)}) THEN 3.0`,
    )
  }
  if (preference.dislikedCategoryIds.length) {
    userWhens.push(
      Prisma.sql`WHEN d."categoryId" IN (${Prisma.join(preference.dislikedCategoryIds)}) THEN 0.2`,
    )
  }
  if (userWhens.length) {
    factors.push(Prisma.sql`(CASE ${Prisma.join(userWhens, ' ')} ELSE 1.0 END)`)
  }

  const biasEntries = Object.entries(context.categoryBias)
  if (biasEntries.length) {
    const biasWhens = biasEntries.map(
      ([categoryId, weight]) =>
        Prisma.sql`WHEN d."categoryId" = ${categoryId} THEN ${weight}::numeric`,
    )
    factors.push(Prisma.sql`(CASE ${Prisma.join(biasWhens, ' ')} ELSE 1.0 END)`)
  }

  factors.push(
    Prisma.sql`(CASE WHEN d."priceLevel" > ${preference.priceMax} THEN 0.4 ELSE 1.0 END)`,
  )
  if (context.hotWeather) {
    factors.push(Prisma.sql`(CASE WHEN d."spicyLevel" >= 2 THEN 0.6 ELSE 1.0 END)`)
  }
  // 点赞软加权：只对登录用户生效，游客没有可承载的长期偏好。
  // 用 ::text 比较而不是 'LIKE'::"DishFeedbackAction"：LIKE 是 20261119090000 迁移新增的枚举值，
  // 未执行该迁移的库直接 cast 会抛 22P02，把随机推荐打成 500；转 text 在迁移前后都能工作。
  if (userId) {
    factors.push(Prisma.sql`
      (CASE WHEN EXISTS (
        SELECT 1 FROM "dish_feedbacks" f
        WHERE f."userId" = ${userId}
          AND f."dishId" = d."id"
          AND f."action"::text = 'LIKE'
          AND f."createdAt" >= (NOW() - (${FEEDBACK_DAYS} * INTERVAL '1 day'))
      ) THEN 1.5 ELSE 1.0 END)
    `)
  }

  // 至少有一个因子；用乘法合并所有倍率。
  return Prisma.sql`(${Prisma.join(factors, ' * ')})`
}

/**
 * 从候选池按权重随机取 1 条菜品。
 *
 * 为什么用 $queryRaw 而不是 findMany + Math.random：
 * DISH-02 要求数据库层面随机（加权后仍由 RANDOM() 产生随机性），
 * 且千级数据下全表扫描无感（DISH-08）。
 *
 * 过滤条件对应：
 * - deletedAt IS NULL：软删除（DATA-01）
 * - isPublished：下架菜不参与推荐
 * - mealType 兼容 ANY：筛「午餐」时，标 ANY 的菜也能吃（DISH-06）
 * - excludeIds / 近 N 天历史：去重（DISH-04/05）
 * - allergens / spicyMax：忌口与辣度硬约束（PREF-02/03）
 */
async function randomOne(
  userId: string | null,
  filters: RandomFilters,
  excludeIds: string[],
  context: RecommendContext,
  servingMode: 'SINGLE' | 'DISH',
  role?: 'MAIN' | 'VEG' | 'SOUP',
): Promise<DishRow | null> {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`d."deletedAt" IS NULL`,
    Prisma.sql`d."isPublished" = true`,
    // 枚举列与字符串参数比较时必须显式 CAST，否则 PostgreSQL 报 operator does not exist。
    Prisma.sql`d."servingMode" = ${servingMode}::"ServingMode"`,
  ]
  if (role) conditions.push(Prisma.sql`d."role" = ${role}::"DishRole"`)
  if (filters.categoryId) conditions.push(Prisma.sql`d."categoryId" = ${filters.categoryId}`)
  // 传入具体餐别时，匹配该餐别 + ANY；不传表示全部。
  if (filters.mealType && filters.mealType !== 'ANY') {
    conditions.push(
      Prisma.sql`(d."mealType" = ${filters.mealType}::"MealType" OR d."mealType" = 'ANY'::"MealType")`,
    )
  }
  if (excludeIds.length) {
    conditions.push(Prisma.sql`d."id" NOT IN (${Prisma.join(excludeIds)})`)
  }
  // 忌口/过敏原：数组有交集即排除。硬约束，降级轮也不放宽（PREF-02）。
  if (context.preference.allergens.length) {
    conditions.push(
      Prisma.sql`NOT (d."allergens" && ${allergenArraySql(context.preference.allergens)})`,
    )
  }
  // 辣度上限：不吃辣的用户不应该抽到重辣菜（PREF-03）。
  conditions.push(Prisma.sql`d."spicyLevel" <= ${context.preference.spicyMax}`)
  // 近 N 天历史去重：只过滤登录用户，游客无历史（DISH-05）。
  // 窗口天数由用户在首页选择，0 表示本次不按历史去重；未选时用环境变量默认值。
  const dedupeDays = resolveDedupeDays(filters)
  if (userId && dedupeDays > 0) {
    conditions.push(Prisma.sql`
      d."id" NOT IN (
        SELECT h."dishId" FROM "dining_histories" h
        WHERE h."userId" = ${userId}
          AND h."eatenOn" >= (CURRENT_DATE - (${dedupeDays} - 1) * INTERVAL '1 day')
      )
    `)
  }
  // 「不感兴趣」硬排除（PREF-11）：与历史去重不同，降级轮丢弃 excludeIds 时也不得恢复，
  // 否则用户刚点过不感兴趣的菜会立刻又出现。
  if (userId) conditions.push(dislikedDishExclusionSql(userId))

  const weightSql = buildWeightSql(context, userId)
  // 自定义枚举数组（Allergen[]）没有内置的 pg 类型解析器，直接 SELECT 会拿到
  // "{PEANUT}" 这样的字符串而不是数组。这里显式转成 text[]，让 pg 按普通数组解析。
  const selectSql = Prisma.join(
    Object.keys(dishSelect).map((key) =>
      key === 'allergens'
        ? Prisma.raw(`ARRAY(SELECT t.x::text FROM unnest(d."allergens") AS t(x)) AS "allergens"`)
        : Prisma.raw(`d."${key}"`),
    ),
  )
  const rows = await prisma.$queryRaw<DishRow[]>(Prisma.sql`
    SELECT ${selectSql}
    FROM "dishes" d
    WHERE ${Prisma.join(conditions, ' AND ')}
    ORDER BY -LN(RANDOM()) / ${weightSql} ASC
    LIMIT 1
  `)
  return rows[0] ?? null
}
