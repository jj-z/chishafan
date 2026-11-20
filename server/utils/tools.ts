// 工具调度（D4）：把模型发起的 function call 落到真实业务逻辑上。
//
// 安全约束：
// 1. 每个工具的参数都用 Zod 校验，模型传错结构时返回 { ok:false }，绝不抛 500；
// 2. 工具只暴露白名单里的能力，模型无法通过参数构造任意 SQL 或访问其它表；
// 3. 所有返回值都是可 JSON 序列化的普通对象，直接作为 tool message 回传给模型。

import { z } from 'zod'
import { pickStaple, PRICE_LABELS, SPICY_LABELS } from '../../shared/utils/dish'
import type { RecommendCandidate } from './dish'
import { getWeatherByCity, regionCuisineHint, weatherMealHint } from './ambient'
import { prisma } from './db'
import { searchKnowledge } from './knowledge'
import type { RecommendContext } from './recommend'

/** 一次工具执行可用的上下文，由 /api/recommend 组装后传入。 */
export interface ToolContext {
  userId: string | null
  context: RecommendContext
  /** 已按忌口/辣度/历史过滤的真实候选（REC-01）。 */
  candidates: RecommendCandidate[]
  /** 近 7 天点过赞的菜，用于软加权（PREF-12）。 */
  likedDishIds: Set<string>
  categoryName: (categoryId: string) => string
}

export interface ToolOutcome {
  ok: boolean
  /** 回传给模型的数据。 */
  data?: unknown
  /** 失败原因（中文），模型会据此向用户解释。 */
  error?: string
  /** 给前端展示的一句话状态，例如「天气：上海 晴 21℃」。 */
  summary?: string
  /** 本轮是否命中了知识库（用于 result 事件的 grounded 字段）。 */
  grounded?: boolean
  /** 调用了检索但没有命中：前端据此提示「知识库未找到依据」。 */
  knowledgeMiss?: boolean
  /** 推荐工具真正选中的菜品 id（模型漏写标记时，服务端用它兜底出卡片）。 */
  pickedDishIds?: string[]
  /** 这顿饭的搭配说明，例如「主菜 + 配菜 + 汤，主食：米饭」。 */
  mealLabel?: string
}

const timeArgs = z.object({}).strict()
const weatherArgs = z.object({ city: z.string().trim().min(1).max(30).optional() }).strict()
/** 位置工具不需要参数：用户位置在请求上下文里已经解析好了（ambient）。 */
const locationArgs = z.object({}).strict()

const recommendArgs = z
  .object({
    limit: z.number().int().min(1).max(12).optional(),
    mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'ANY']).optional(),
    keyword: z.string().trim().min(1).max(30).optional(),
  })
  .strict()

const knowledgeArgs = z.object({ query: z.string().trim().min(1).max(200) }).strict()

const feedbackArgs = z
  .object({
    dishName: z.string().trim().min(1).max(50),
    action: z.enum(['LIKE', 'DISLIKE']),
  })
  .strict()

/** 用北京时间展示「今天几号、几点、星期几」，避免服务器时区与用户不一致。 */
function currentTimeSnapshot() {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'long',
    hour12: false,
  }).formatToParts(now)

  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? ''

  const hour = Number.parseInt(pick('hour'), 10)
  // 餐别只用于给模型一个提示，最终仍由模型结合用户意图判断。
  const mealPeriod =
    hour < 10 ? 'BREAKFAST' : hour < 15 ? 'LUNCH' : hour < 21 ? 'DINNER' : 'LATE_NIGHT'

  return {
    date: `${pick('year')}-${pick('month')}-${pick('day')}`,
    time: `${pick('hour')}:${pick('minute')}`,
    weekday: pick('weekday'),
    mealPeriod,
    iso: now.toISOString(),
  }
}

/** 候选排序：菜系软偏好 + 点赞软加权，再加一点随机抖动保证每次推荐不完全一样。 */
function scoreCandidate(candidate: RecommendCandidate, ctx: ToolContext): number {
  let score = 1
  score *= ctx.context.categoryBias[candidate.categoryId] ?? 1

  const preference = ctx.context.preference
  if (preference.likedCategoryIds.includes(candidate.categoryId)) score *= 3
  if (preference.dislikedCategoryIds.includes(candidate.categoryId)) score *= 0.2
  if (ctx.likedDishIds.has(candidate.id)) score *= 1.5

  // 抖动系数 0.8~1.2：既不破坏权重排序，又不会每次都推同一道菜。
  return score * (0.8 + Math.random() * 0.4)
}

function matchesKeyword(candidate: RecommendCandidate, keyword: string): boolean {
  const needle = keyword.toLowerCase()
  const haystack = [candidate.name, ...candidate.tags, ...candidate.ingredients]
    .join(' ')
    .toLowerCase()
  return haystack.includes(needle)
}

/** 把模型给的菜名解析成候选里的真实菜品；先精确匹配，再唯一包含匹配。 */
function resolveDishId(dishName: string, ctx: ToolContext): { id?: string; name?: string } {
  const exact = ctx.candidates.find((candidate) => candidate.name === dishName)
  if (exact) return { id: exact.id, name: exact.name }

  const loose = ctx.candidates.filter(
    (candidate) => candidate.name.includes(dishName) || dishName.includes(candidate.name),
  )
  return loose.length === 1 ? { id: loose[0]?.id, name: loose[0]?.name } : {}
}

function runGetTime(): ToolOutcome {
  const snapshot = currentTimeSnapshot()
  return {
    ok: true,
    data: snapshot,
    summary: `${snapshot.date} ${snapshot.time}`,
  }
}

async function runGetWeather(args: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const parsed = weatherArgs.safeParse(args)
  if (!parsed.success) return { ok: false, error: '天气工具参数不合法' }

  const city = parsed.data.city ?? ctx.context.ambient.city ?? undefined
  if (!city) {
    return { ok: false, error: '无法确定城市，请先调用 get_location 或询问用户所在城市' }
  }

  const weather = await getWeatherByCity(city)
  if (!weather) return { ok: false, error: '天气服务暂时不可用，请如实告知用户' }

  return {
    ok: true,
    data: {
      city,
      tempC: weather.tempC,
      text: weather.text,
      kind: weather.kind,
      // mealHint 让模型能直接说「天冷适合喝汤」，而不是自己解读温度数字。
      mealHint: weatherMealHint(weather.kind),
    },
    summary: `${city} ${weather.text} ${weather.tempC}℃`,
  }
}

/**
 * 位置工具：直接复用请求入口已经解析好的 ambient 信息。
 * 为什么不再调一次 IP 定位：同一个请求里 ambient 已经在 loadRecommendContext 里解析过，
 * 重复调既浪费第三方配额，结果也不会变；定位失败时如实返回 null，不编造位置。
 */
function runGetLocation(ctx: ToolContext): ToolOutcome {
  const { city, province } = ctx.context.ambient
  if (!city && !province) {
    return {
      ok: true,
      data: { city: null, province: null, regionHint: null },
      summary: '暂无法定位',
    }
  }

  return {
    ok: true,
    data: {
      city,
      province,
      regionHint: regionCuisineHint(province, city),
    },
    summary: city ? city : (province ?? '未知'),
  }
}

/** 配菜角色 → 在「一餐」里的位置，模型与前端都用这套说法（MEAL-04）。 */
const ROLE_LABELS: Record<string, string> = { MAIN: '主菜', VEG: '配菜', SOUP: '汤' }

/**
 * 未指定餐别时按北京时间推断：晚上 9 点后还推一套豆浆油条显然不合理。
 * 只做粗粒度三段划分，精确判断仍交给模型结合用户原话。
 */
function inferMealType(): 'BREAKFAST' | 'LUNCH' | 'DINNER' {
  const hour = Number.parseInt(
    new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      hour12: false,
    }).format(new Date()),
    10,
  )
  if (hour < 10) return 'BREAKFAST'
  return hour < 15 ? 'LUNCH' : 'DINNER'
}

/** 加权随机取一个未使用的候选；先按偏好打分，再乘随机数，兼顾命中率与多样性。 */
function pickOne(
  pool: RecommendCandidate[],
  ctx: ToolContext,
  used: Set<string>,
): RecommendCandidate | undefined {
  const rest = pool.filter((candidate) => !used.has(candidate.id))
  if (!rest.length) return undefined
  return rest
    .map((candidate) => ({ candidate, rank: scoreCandidate(candidate, ctx) * Math.random() }))
    .sort((a, b) => b.rank - a.rank)[0]?.candidate
}

/**
 * 把候选拼成「一餐」而不是一堆同类菜（MEAL-01/04）。
 *
 * 为什么必须由工具组餐而不是让模型挑：模型只看到菜名，很容易把三道辣主菜当成
 * 一顿饭；这里按 servingMode/role 保证结构是 主菜 + 配菜 + 汤 + 主食。
 */
function composeMeal(
  pool: RecommendCandidate[],
  ctx: ToolContext,
): {
  dishes: Array<{ candidate: RecommendCandidate; label: string }>
  staple?: string
  label: string
} {
  const used = new Set<string>()
  const chosen: Array<{ candidate: RecommendCandidate; label: string }> = []

  const mains = pool.filter((c) => c.servingMode === 'DISH' && c.role === 'MAIN')
  const vegs = pool.filter((c) => c.servingMode === 'DISH' && c.role === 'VEG')
  const soups = pool.filter((c) => c.servingMode === 'DISH' && c.role === 'SOUP')
  const singles = pool.filter((c) => c.servingMode === 'SINGLE')

  const main = pickOne(mains, ctx, used)
  if (main) {
    chosen.push({ candidate: main, label: ROLE_LABELS.MAIN ?? '主菜' })
    used.add(main.id)

    const veg = pickOne(vegs, ctx, used)
    if (veg) {
      chosen.push({ candidate: veg, label: ROLE_LABELS.VEG ?? '配菜' })
      used.add(veg.id)
    }
    const soup = pickOne(soups, ctx, used)
    if (soup) {
      chosen.push({ candidate: soup, label: ROLE_LABELS.SOUP ?? '汤' })
      used.add(soup.id)
    }

    // 主食只给名字（MEAL-05：按菜系加权，不固定米饭），不算一道菜。
    const staple = pickStaple(main.categoryId)
    return {
      dishes: chosen,
      staple,
      label: `${chosen.map((item) => item.label).join(' + ')}，主食：${staple}`,
    }
  }

  // 没有主菜时优先单品：粉面饭本身就是完整一餐（MEAL-01）。
  const single = pickOne(singles, ctx, used)
  if (single) {
    return {
      dishes: [{ candidate: single, label: '单点一餐' }],
      label: '单品即一餐',
    }
  }

  // 最后退路：最多两道，避免把属性相近的菜堆成三四道。
  for (let i = 0; i < 2; i++) {
    const candidate = pickOne(pool, ctx, used)
    if (!candidate) break
    chosen.push({ candidate, label: '配菜' })
    used.add(candidate.id)
  }
  return { dishes: chosen, label: chosen.map((item) => item.candidate.name).join(' + ') }
}

function runRecommendDishes(args: unknown, ctx: ToolContext): ToolOutcome {
  const parsed = recommendArgs.safeParse(args)
  if (!parsed.success) return { ok: false, error: '推荐工具参数不合法' }

  const { mealType, keyword } = parsed.data
  const notes: string[] = []

  // 餐别是软筛选：命中不了就退回全量，否则「晚餐时段只有早餐菜」会直接推不出东西。
  let pool = ctx.candidates
  const targetMeal = mealType && mealType !== 'ANY' ? mealType : inferMealType()
  const byMeal = pool.filter(
    (candidate) => candidate.mealType === targetMeal || candidate.mealType === 'ANY',
  )
  if (byMeal.length) pool = byMeal
  else notes.push('当前餐别的菜不足，已从全部菜品里搭配')

  // 关键词同样是软筛选：用户说「清爽」而标签里没有这个词时，不能因此拒绝推荐。
  if (keyword) {
    const byKeyword = pool.filter((candidate) => matchesKeyword(candidate, keyword))
    if (byKeyword.length) pool = byKeyword
    else notes.push(`没有完全匹配「${keyword}」的菜，按口味偏好搭配了相近的`)
  }

  if (!pool.length) return { ok: false, error: '没有同时满足忌口与辣度条件的菜' }

  const meal = composeMeal(pool, ctx)
  if (!meal.dishes.length) return { ok: false, error: '没有可搭配的菜' }

  const dishes = meal.dishes.map(({ candidate, label }) => ({
    name: candidate.name,
    role: label,
    category: ctx.categoryName(candidate.categoryId),
    spicyLevel: SPICY_LABELS[candidate.spicyLevel] ?? '未知',
    priceLevel: PRICE_LABELS[candidate.priceLevel - 1] ?? '未知',
    tags: candidate.tags,
    ingredients: candidate.ingredients,
  }))

  return {
    ok: true,
    data: {
      meal: { staple: meal.staple ?? null, dishes },
      // note 是事实说明，不是给模型复述的指令：模型据此知道搭配被放宽的原因。
      note: notes.length ? notes.join('；') : undefined,
    },
    pickedDishIds: meal.dishes.map(({ candidate }) => candidate.id),
    mealLabel: meal.label,
    summary: meal.label,
  }
}

async function runSearchKnowledge(args: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const parsed = knowledgeArgs.safeParse(args)
  if (!parsed.success) return { ok: false, error: '检索工具参数不合法' }

  const result = await searchKnowledge(parsed.data.query, { userId: ctx.userId })
  if (!result.found) {
    return {
      ok: true,
      grounded: false,
      knowledgeMiss: true,
      data: {
        found: false,
        degraded: result.degraded,
      },
      summary: '知识库未命中',
    }
  }

  return {
    ok: true,
    grounded: true,
    data: {
      found: true,
      degraded: result.degraded,
      hits: result.hits.map((hit) => ({
        content: hit.content,
        score: Number(hit.score.toFixed(3)),
      })),
    },
    summary: `命中 ${result.hits.length} 条知识`,
  }
}

async function runRecordFeedback(args: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const parsed = feedbackArgs.safeParse(args)
  if (!parsed.success) return { ok: false, error: '反馈工具参数不合法' }

  if (!ctx.userId) {
    return { ok: false, error: '登录后才能记录口味偏好，请提示用户先登录' }
  }

  const { id, name } = resolveDishId(parsed.data.dishName, ctx)
  if (!id) {
    return {
      ok: false,
      error: `候选里没有「${parsed.data.dishName}」，请先调用 recommend_dishes 确认真实菜名`,
    }
  }

  const userId = ctx.userId
  const opposite = parsed.data.action === 'LIKE' ? 'DISLIKE' : 'LIKE'

  // 同一种反馈重复提交只刷新时间；同时删掉相反动作，避免 LIKE 与 DISLIKE 并存。
  await prisma.$transaction([
    prisma.dishFeedback.upsert({
      where: { userId_dishId_action: { userId, dishId: id, action: parsed.data.action } },
      create: { userId, dishId: id, action: parsed.data.action },
      update: { createdAt: new Date() },
    }),
    prisma.dishFeedback.deleteMany({ where: { userId, dishId: id, action: opposite } }),
  ])

  return {
    ok: true,
    data: { dishName: name, action: parsed.data.action },
    summary: parsed.data.action === 'LIKE' ? `已记下喜欢「${name}」` : `已记下不喜欢「${name}」`,
  }
}

/** 模型返回的 arguments 是字符串，解析失败按参数错误处理。 */
function parseArguments(raw: string): unknown {
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * 按工具名分发。未知工具或参数非法都返回结构化失败，
 * 让模型能向用户解释，而不是让整轮对话以异常结束。
 */
export async function dispatchTool(
  name: string,
  rawArguments: string,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const args = parseArguments(rawArguments)
  if (args === null) return { ok: false, error: '工具参数不是合法 JSON' }

  switch (name) {
    case 'get_current_time':
      if (!timeArgs.safeParse(args).success) return { ok: false, error: '时间工具参数不合法' }
      return runGetTime()
    case 'get_location':
      if (!locationArgs.safeParse(args).success) return { ok: false, error: '位置工具参数不合法' }
      return runGetLocation(ctx)
    case 'get_weather':
      return runGetWeather(args, ctx)
    case 'recommend_dishes':
      return runRecommendDishes(args, ctx)
    case 'search_knowledge':
      return runSearchKnowledge(args, ctx)
    case 'record_feedback':
      return runRecordFeedback(args, ctx)
    default:
      return { ok: false, error: `未知工具：${name}` }
  }
}
