// Agent 循环的纯逻辑（D5）。
//
// 刻意与真实依赖分离：这里只依赖「决策 / 作答 / 调度」三个函数，
// 不 import tools.ts（那会把 Prisma 连接拖进单元测试，见 pitfalls #12）。
// 业务接线在 agent.ts。

import type { ChatCompletionResult, LlmMessage } from './llm'
import {
  addUsage,
  EMPTY_USAGE,
  estimateMessagesTokens,
  estimateTokens,
  type TokenUsage,
} from './tokenEstimate'
import type { ToolOutcome } from './tools'

/** 决策阶段最多 5 步：时间/天气/检索/推荐/反馈五个工具，再给一步只会原地打转。 */
export const MAX_AGENT_STEPS = 5

/** 同一工具 + 同一参数最多调用 2 次：第 3 次一定是死循环，强制收尾。 */
const MAX_SAME_TOOL_CALLS = 2

export interface AgentDeps {
  decide: (messages: LlmMessage[]) => Promise<ChatCompletionResult>
  answer: (messages: LlmMessage[], onDelta: (text: string) => void) => Promise<string>
  dispatch: (name: string, argumentsJson: string) => Promise<ToolOutcome>
}

export interface AgentParams {
  messages: LlmMessage[]
  /** 本次请求是否还能继续消耗额度；返回 false 时提前进入作答阶段。 */
  canContinue: () => boolean
  /** 每次模型调用后回调真实/估算用量，调用方负责落库扣额度。 */
  onUsage: (usage: TokenUsage) => Promise<void> | void
  onDelta: (text: string) => void
  /** 工具执行状态，用于前端展示「正在查天气…」。 */
  onTool?: (event: { name: string; status: 'start' | 'ok' | 'fail'; message?: string }) => void
  maxSteps?: number
  /** 单轮 token 预算，超过后停止调用工具，直接作答。 */
  maxTurnTokens?: number
}

export interface AgentResult {
  text: string
  steps: number
  usage: TokenUsage
  grounded: boolean
  knowledgeMiss: boolean
  usedTools: string[]
  /** 推荐工具选中的真实菜品 id：模型忘记输出标记时，服务端靠它兜底出卡片。 */
  recommendedDishIds: string[]
  /** 这顿饭的搭配说明（主食/主菜/配菜），来自最后一次推荐工具。 */
  mealLabel?: string
  /** 因步数或预算提前结束（仍会产出答案，但可能没查全）。 */
  truncated: boolean
}

/** 工具结果统一序列化回模型；失败也作为 tool message 返回，而不是抛异常中断整轮。 */
function serializeOutcome(outcome: ToolOutcome): string {
  return JSON.stringify(outcome)
}

/**
 * 执行一次完整的 Agent 轮次。
 * 决策阶段只负责选工具，最终一定走一次流式作答，保证前端始终能拿到文字。
 */
export async function runAgentLoop(deps: AgentDeps, params: AgentParams): Promise<AgentResult> {
  const maxSteps = params.maxSteps ?? MAX_AGENT_STEPS
  const maxTurnTokens = params.maxTurnTokens ?? 6000
  const messages: LlmMessage[] = [...params.messages]

  let steps = 0
  let usage: TokenUsage = { ...EMPTY_USAGE }
  let grounded = false
  let knowledgeMiss = false
  let truncated = false
  let recommendedDishIds: string[] = []
  let mealLabel: string | undefined
  const usedTools: string[] = []
  const callCounts = new Map<string, number>()

  while (steps < maxSteps) {
    if (!params.canContinue()) {
      truncated = true
      break
    }

    const decision = await deps.decide(messages)
    steps += 1
    usage = addUsage(usage, decision.usage)
    await params.onUsage(decision.usage)

    if (!decision.toolCalls.length) break

    // 把模型请求工具的那条 assistant 消息原样放回历史，工具结果才能与 tool_call_id 对应。
    messages.push({
      role: 'assistant',
      content: decision.content || null,
      tool_calls: decision.toolCalls,
    })

    for (const call of decision.toolCalls) {
      const name = call.function.name
      const key = `${name}:${call.function.arguments}`
      const count = (callCounts.get(key) ?? 0) + 1
      callCounts.set(key, count)

      params.onTool?.({ name, status: 'start' })

      const outcome: ToolOutcome =
        count > MAX_SAME_TOOL_CALLS
          ? { ok: false, error: '同一工具同参数重复调用过多，请直接基于已有信息作答' }
          : await deps.dispatch(name, call.function.arguments)

      if (outcome.grounded) grounded = true
      if (outcome.knowledgeMiss) knowledgeMiss = true
      // 以最后一次推荐为准：多轮工具调用里更晚的结果才代表最终搭配。
      if (outcome.pickedDishIds?.length) recommendedDishIds = outcome.pickedDishIds
      if (outcome.mealLabel) mealLabel = outcome.mealLabel
      if (!usedTools.includes(name)) usedTools.push(name)

      params.onTool?.({
        name,
        status: outcome.ok ? 'ok' : 'fail',
        message: outcome.summary ?? outcome.error,
      })

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: serializeOutcome(outcome),
      })
    }

    if (usage.promptTokens + usage.completionTokens > maxTurnTokens) {
      truncated = true
      break
    }
  }

  if (steps >= maxSteps) truncated = true

  const text = await deps.answer(messages, params.onDelta)

  // 流式作答拿不到 usage（部分供应商不返回），用输入消息与输出文本估算，
  // 与决策阶段的真实用量合并后一起记账。
  const answerUsage: TokenUsage = {
    promptTokens: estimateMessagesTokens(messages),
    completionTokens: estimateTokens(text),
  }
  usage = addUsage(usage, answerUsage)
  await params.onUsage(answerUsage)

  return {
    text,
    steps,
    usage,
    grounded,
    knowledgeMiss,
    usedTools,
    recommendedDishIds,
    mealLabel,
    truncated,
  }
}
