// AI 智能问答接口：POST /api/recommend（SSE 流式响应）。
//
// 与技术方案 D1~D8 对应，整体流程：
// 1. 先扣「请求次数」配额（防刷）与「token」配额（控成本），任一条不满足都不请求上游；
// 2. Agent 决策阶段最多 5 步，通过 skill.md 定义的工具查时间/天气/知识库/推荐/记反馈；
// 3. 最终答案用流式调用产出，保持打字机效果；菜品一律按菜名回查数据库组装（REC-02）；
// 4. 检索未命中时把 knowledgeMiss 透传给前端，让用户看到「知识库确实没有」而不是被编造糊弄；
// 5. 任何失败都以 SSE error 事件收尾（REC-03），绝不把 500 裸抛给前端。

import {
  recommendRequestSchema,
  type RecommendEvent,
  type RecommendResultEvent,
} from '../../shared/schemas/recommend'
import { dishSelect, listRecommendCandidates, toDishDetail } from '../utils/dish'
import { runAgent } from '../utils/agent'
import { weatherMealHint } from '../utils/ambient'
import { getLlmConfig } from '../utils/llm'
import { loadRecommendContext, toAmbientDto } from '../utils/recommend'
import { consumeAiQuota } from '../utils/rateLimit'
import { parseDishMarker } from '../utils/recommendParse'
import { chargeTokens, getTokenQuota, quotaSubject, registerAiRequest } from '../utils/tokenQuota'
import { tokenLimitFor } from '../utils/quotaMath'
import type { ToolContext } from '../utils/tools'
import { validateBody } from '../utils/validate'

/**
 * 聊天历史最多保留 5 轮（一问一答算一轮，共 10 条）。
 * 太少无法理解「那有没有不辣的」这类指代，太多会稀释当前问题并推高 token 成本。
 */
const MAX_HISTORY_ROUNDS = 5

/** 单轮至少还要有这么多 token 才值得发起请求；否则直接提示额度用完。 */
const MIN_TURN_TOKENS = 200

/** 近 7 天点过赞的菜参与软加权，与 DISLIKE 的 7 天硬排除窗口保持一致（PREF-12）。 */
const LIKE_WINDOW_DAYS = 7

/**
 * 把内部异常翻译成用户能看懂的一句话。
 * 聊天页会把 error 事件的 message 直接展示给用户，把 Prisma / SQL 原文抛出去
 * 既看不懂，也会泄漏表结构与实现细节；原始错误仍完整写入服务端日志。
 */
function toUserFacingError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (/ai_usage_daily|knowledge_chunks|rag_miss_logs|不存在/.test(message)) {
    return 'AI 服务正在升级中，请稍后再试'
  }
  if (/NUXT_LLM_API_KEY|未配置/.test(message)) return 'AI 服务还没配置好，请稍后再试'
  if (/超时|timeout/i.test(message)) return 'AI 服务响应超时了，请稍后再试'
  return 'AI 服务出了点问题，请稍后再试'
}

/**
 * 把一次 AI 调用的结果落库（P2-12 看板的失败率与平均耗时依赖它）。
 * 写日志失败只告警、不影响已经发给用户的结果，所以不 await、单独 catch。
 * 不记录用户问题与模型输出，只留指标与截断后的错误文本。
 */
function recordAiCall(ok: boolean, durationMs: number, error?: string): void {
  void prisma.aiCallLog
    .create({
      data: { ok, durationMs, error: error ? error.slice(0, 500) : null },
    })
    .catch((err: unknown) => {
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'ai_call.log',
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    })
}

/**
 * 把推荐上下文翻译成 system prompt 里的「用户上下文」段落。
 * 地域口味与天气要作为系统 prompt 的一部分，让模型能说清楚
 * 「为什么现在推荐这顿」——数据库加权只影响随机推荐，模型需要显式被告知。
 */
function buildContextSummary(
  ctx: Awaited<ReturnType<typeof loadRecommendContext>>,
  categoryName: (id: string) => string,
): string {
  const lines: string[] = []

  const { city } = ctx.ambient
  const weather = ctx.ambient.weather
  if (city || weather) {
    const weatherText = weather ? `${weather.text} ${weather.tempC}℃` : '未知'
    lines.push(`- 用户当前位于${city ?? '未知城市'}，天气：${weatherText}`)
    if (weather) {
      // 把天气归一成一句口语化提示，模型不用自己解读温度数字。
      // 与 get_weather 工具返回的 mealHint 口径一致，避免两处说法矛盾。
      const hint = weatherMealHint(weather.kind)
      if (hint) lines.push(`- ${hint}`)
    }
  }

  const p = ctx.preference
  const liked = p.likedCategoryIds.map(categoryName).join('、')
  const disliked = p.dislikedCategoryIds.map(categoryName).join('、')
  const preferParts: string[] = []
  if (liked) preferParts.push(`喜欢的菜系：${liked}`)
  if (disliked) preferParts.push(`不喜欢的菜系：${disliked}（不推荐，除非用户主动要求）`)
  if (ctx.preferenceApplied) lines.push(`- 用户口味偏好：${preferParts.join('；') || '无特殊偏好'}`)
  const SPICY_TEXT = ['不吃辣', '微辣', '中辣', '能吃重辣']
  lines.push(`- 辣度上限：${SPICY_TEXT[p.spicyMax]}（超过的菜已从候选中过滤）`)
  if (p.priceMax < 3)
    lines.push(`- 价格上限：人均价位 ${'¥'.repeat(p.priceMax)} 以内（超出过的菜尽量别推）`)

  return lines.join('\n')
}

/**
 * Agent 的系统提示词。
 *
 * 刻意不再把全部候选菜塞进 prompt：菜品清单改由 recommend_dishes 工具按需返回，
 * 既降低每轮 token 成本，也让「推荐必须来自真实候选」这条约束由工具强制执行。
 */
function buildSystemPrompt(
  ctx: Awaited<ReturnType<typeof loadRecommendContext>>,
  categoryName: (id: string) => string,
): string {
  return [
    '你是「吃啥饭」App 的美食助手。你的核心任务是帮用户决定「这一顿」吃什么，',
    '推荐的必须是一套搭配，而不是几道属性相同的菜。',
    '',
    '【推荐规则】',
    '- 用户说想吃什么、来点辣的/清淡的、想吃一餐饭时，必须调用 recommend_dishes；',
    '- recommend_dishes 返回的是一套餐（主食 + 主菜 + 配菜/汤），你要按这套整体介绍，',
    '  说明为什么这一餐适合用户此刻，而不是把菜一道一道孤立点评；',
    '- 只能介绍工具返回的菜，禁止自己增删或替换；',
    '- 工具提示「没有完全匹配」时，照实说一句「没有完全对上的，按口味配了相近的」即可，不要因此拒绝推荐。',
    '',
    '【知识问答】',
    '- 询问某道菜的食材、过敏原、辣度、做法或价位时，调用 search_knowledge；',
    '- 检索没命中只代表这一条事实没有记录，用一句话说明即可，不要用它否定推荐能力；',
    '- 问店铺、地址、外卖平台、某地哪家店好吃等库外信息时，直接说「我只掌握这个 App 的菜品信息，帮不了这个问题」，不要假装还能查。',
    '',
    '【其他工具】',
    '- 问时间或天气时调用 get_current_time / get_weather，禁止自行猜测；',
    '- 想知道用户在哪、或推荐时想结合地域口味时调用 get_location；',
    '- 用户明确说喜欢或不喜欢某道菜时，调用 record_feedback。',
    '',
    '【位置与天气适配推荐】',
    '- 推荐前如果还不知道用户位置或天气，先调用 get_location / get_weather 拿上下文；',
    '- get_location 返回 regionHint（地域口味偏好），get_weather 返回 mealHint（天气餐食建议），',
    '  这些是软参考：可以在推荐理由里提及（如「你在四川，给你配了道麻辣的」「天冷，来碗热汤」），',
    '  但用户明确说想吃什么时仍以用户意愿为准；',
    '- 位置与天气的权重已经在 recommend_dishes 内部生效（地域/天气软加权），你不需要额外筛菜。',
    '',
    '【诚实原则】',
    '- 工具没有给出的信息不要推测或编造；',
    '- 与吃饭无关的问题，简短回应后把话题引回「吃啥饭」；',
    '- 禁止描述工具调用过程（例如「我需要调用某个工具」「让我先查一下」），直接给结论；',
    '- 禁止复述工具返回的原始字段或内部说明，用你自己的口语表达。',
    '',
    '【用户上下文】',
    buildContextSummary(ctx, categoryName),
    '',
    '【输出要求】',
    '1. 中文口语化，像朋友推荐一餐，不超过 220 字；',
    '2. 按「主食 + 菜」的口吻介绍整套搭配，每道菜用一句话说明理由；',
    '3. 最后一行单独输出标记，格式为 <<DISHES:["菜名1","菜名2"]>>，菜名必须与 recommend_dishes 返回的完全一致；不推荐菜品时不要输出标记；',
    '4. 正文只使用工具结果与知识片段里已有的事实；',
    '5. 正文点名的菜必须与标记里的菜名一一对应；',
    '6. 除标记行外，不要输出编号、Markdown 列表符号或任何内部标识。',
  ].join('\n')
}

/** 近 7 天点赞过的菜 id，用于推荐工具的软加权。查询失败不影响主流程。 */
async function loadLikedDishIds(userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set()
  try {
    const rows = await prisma.dishFeedback.findMany({
      where: {
        userId,
        action: 'LIKE',
        createdAt: { gte: new Date(Date.now() - LIKE_WINDOW_DAYS * 24 * 60 * 60 * 1000) },
      },
      select: { dishId: true },
    })
    return new Set(rows.map((row) => row.dishId))
  } catch {
    return new Set()
  }
}

export default defineEventHandler(async (event) => {
  const body = await validateBody(event, recommendRequestSchema)

  // 游客也能用 AI 问答；登录用户才叠加口味偏好、历史去重与账号额度。
  // 用 getOptionalActiveUser：改密/注销后的旧 cookie 按游客处理（AUTH-12 / REC-07）。
  const user = await getOptionalActiveUser(event)
  const userId = user?.id ?? null

  // 先扣每日请求次数配额（REC-07）：超限时连定位、知识库与上游 LLM 都不碰。
  const quota = consumeAiQuota(event, userId)

  // SSE 响应头：text/event-stream 是协议规定；no-cache 防止代理缓冲；
  // X-Accel-Buffering 告诉 Nginx 不要攒够再发。
  setHeaders(event, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const res = event.node.res
  /** 发送一条 SSE 事件。data 里的 type 字段区分事件类型（见 shared/schemas/recommend.ts）。 */
  const send = (payload: RecommendEvent) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`)
  }

  // 配额超限也用 SSE error 收尾：前端聊天页只需处理同一种错误气泡。
  if (!quota.allowed) {
    send({
      type: 'error',
      message: `今天的 AI 次数已用完（每天 ${quota.limit} 次），明天再来吧`,
    })
    res.end()
    return
  }

  // 客户端中途关页/点停止时中止上游 LLM 请求，避免白白烧完一整次模型额度。
  const upstreamAbort = new AbortController()
  res.on('close', () => upstreamAbort.abort())

  const startedAt = Date.now()
  let candidateCount = 0
  let agentSteps = 0
  let usedTokens = 0

  try {
    const config = getLlmConfig()

    // ===== Token 额度检查（D6）=====
    const tokenLimit = tokenLimitFor(userId)
    const subject = quotaSubject(event, userId)
    const initialQuota = await getTokenQuota(subject, tokenLimit)
    if (initialQuota.remaining < MIN_TURN_TOKENS) {
      send({
        type: 'error',
        message: `今天的 AI 额度已用完（每日 ${tokenLimit} tokens），明天再聊吧`,
      })
      return
    }
    await registerAiRequest(subject)

    // 本轮剩余额度：随每次模型调用递减，降到 0 时停止继续调工具，直接作答。
    let remaining = initialQuota.remaining
    const onUsage = async (usage: { promptTokens: number; completionTokens: number }) => {
      const delta = usage.promptTokens + usage.completionTokens
      usedTokens += delta
      remaining = Math.max(0, remaining - delta)
      try {
        const next = await chargeTokens(subject, usage, tokenLimit)
        remaining = next.remaining
        send({ type: 'quota', used: next.used, limit: next.limit, remaining: next.remaining })
      } catch (err) {
        // 记账失败只告警：本次问答已经发生，不能因为统计写不进去就把结果吞掉。
        console.warn(
          JSON.stringify({
            level: 'warn',
            event: 'ai_quota.charge',
            error: err instanceof Error ? err.message : String(err),
          }),
        )
      }
    }

    // ===== 上下文与候选 =====
    const context = await loadRecommendContext(event, userId)
    const { candidates } = await listRecommendCandidates(userId, context)
    candidateCount = candidates.length

    if (!candidates.length) {
      // 忌口/辣度是硬约束（PREF-02/03），筛空后禁止放宽（REC-04）。
      send({
        type: 'error',
        message: context.preferenceApplied
          ? '你的忌口与辣度条件下没有可推荐的菜，去「我的 → 口味偏好」调整一下试试'
          : '菜品库里暂时没有已上架的菜',
      })
      return
    }

    const categories = await prisma.category.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    })
    const categoryMap = new Map(categories.map((category) => [category.id, category.name]))
    const categoryName = (id: string) => categoryMap.get(id) ?? '其他'

    const likedDishIds = await loadLikedDishIds(userId)
    const toolContext: ToolContext = {
      userId,
      context,
      candidates,
      likedDishIds,
      categoryName,
    }

    // 请求里的 history 是前端保存的最近几轮对话（不含本轮），截到最后 5 轮。
    const history = (body.history ?? []).slice(-MAX_HISTORY_ROUNDS * 2)
    const messages = [
      { role: 'system' as const, content: buildSystemPrompt(context, categoryName) },
      ...history.map((item) => ({ role: item.role, content: item.content })),
      { role: 'user' as const, content: body.message },
    ]

    // ===== Agent 执行（决策 ≤5 步 + 流式作答）=====
    const agentResult = await runAgent({
      config,
      messages,
      toolContext,
      canContinue: () => remaining > 0,
      onUsage,
      onDelta: (text) => send({ type: 'delta', text }),
      onTool: (toolEvent) =>
        send({
          type: 'tool',
          name: toolEvent.name,
          status: toolEvent.status,
          message: toolEvent.message,
        }),
      signal: upstreamAbort.signal,
    })
    agentSteps = agentResult.steps

    // 标记里的菜名只是「模型的选择」，菜品数据必须按菜名反查数据库组装（REC-02）。
    const parsed = parseDishMarker(agentResult.text, candidates)
    let text = parsed.text
    let ids = parsed.dishes.map((dish) => dish.id)

    // 模型偶尔会漏输出标记：用推荐工具真正选中的菜兜底，保证「有推荐就一定有卡片」。
    // 兜底时正文重写为搭配说明，避免把它的寒暄或排障话术当成推荐结果展示。
    if (!ids.length && agentResult.recommendedDishIds.length) {
      ids = agentResult.recommendedDishIds.filter((id) =>
        candidates.some((candidate) => candidate.id === id),
      )
      const names = ids
        .map((id) => candidates.find((candidate) => candidate.id === id)?.name)
        .filter((name): name is string => Boolean(name))
      if (names.length) text = `给你搭配了这一餐：${names.join('、')}。`
    }

    // 检索未命中且没有任何推荐时用固定文案，避免模型把内部提示原样复述给用户。
    if (!ids.length && agentResult.knowledgeMiss && !agentResult.grounded) {
      text = '菜品库里暂时没有这方面的信息。'
    }

    // 兜底拦截「我需要调用某个工具」这类过程性描述：用户要的是结论，不是调试信息。
    if (
      !ids.length &&
      !agentResult.grounded &&
      /(调用|使用).{0,6}(工具|接口)|让我.{0,3}查/.test(text)
    ) {
      text = '我只掌握这个 App 的菜品信息，这个问题暂时帮不了你。'
    }
    const rows = ids.length
      ? await prisma.dish.findMany({
          where: { id: { in: ids }, deletedAt: null, isPublished: true },
          select: dishSelect,
        })
      : []
    // findMany 不保证按传入 id 的顺序返回，这里按模型推荐的顺序排回。
    const rowById = new Map(rows.map((row) => [row.id, row]))
    const dishes = ids
      .map((id) => rowById.get(id))
      .filter((row) => row !== undefined)
      .map(toDishDetail)

    const finalQuota = {
      used: Math.max(0, tokenLimit - remaining),
      limit: tokenLimit,
      remaining,
    }

    const result: RecommendResultEvent = {
      type: 'result',
      text,
      dishes,
      ambient: toAmbientDto(context),
      preferenceApplied: context.preferenceApplied,
      grounded: agentResult.grounded,
      knowledgeMiss: agentResult.knowledgeMiss,
      mealLabel: agentResult.mealLabel,
      quota: finalQuota,
    }
    send(result)

    // 成功留痕：耗时、候选数、Agent 步数与 token 用量，用于观察成本与工具是否被正确使用。
    console.info(
      JSON.stringify({
        level: 'info',
        event: 'llm.recommend',
        requestId: event.context.requestId,
        userId: userId ?? null,
        durationMs: Date.now() - startedAt,
        candidateCount,
        pickedCount: dishes.length,
        steps: agentSteps,
        tokens: usedTokens,
        grounded: agentResult.grounded,
        usedTools: agentResult.usedTools,
        truncated: agentResult.truncated,
        ok: true,
      }),
    )
    recordAiCall(true, Date.now() - startedAt)
  } catch (err: unknown) {
    // 上游/配置/解析的一切失败都以 error 事件收尾（REC-03），前端展示 message 即可。
    if (!res.writableEnded) {
      send({ type: 'error', message: toUserFacingError(err) })
    }
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'llm.recommend',
        requestId: event.context.requestId,
        userId: userId ?? null,
        durationMs: Date.now() - startedAt,
        candidateCount,
        steps: agentSteps,
        tokens: usedTokens,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }),
    )
    recordAiCall(false, Date.now() - startedAt, err instanceof Error ? err.message : String(err))
  } finally {
    res.end()
  }
})
