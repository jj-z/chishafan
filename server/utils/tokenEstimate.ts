// Token 粗估（D6）。
//
// 为什么需要自己估：上游流式响应的 usage 不一定返回；即使返回，也要先扣额度再发请求，
// 因此必须有一个与模型无关的保守估算。单独放在无副作用模块里，单测不会把 Prisma 拖进来
// （见 docs/pitfalls.md #12）。

/**
 * 估算一段文本的 token 数。
 * 中文约 1 token ≈ 1~1.5 字，英文约 1 token ≈ 4 字符；统一按「字符数 / 1.5」计算。
 * 刻意偏高而不是偏低：额度宁可提前一点用完，也不能因为估少了而超支。
 */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0
  return Math.ceil([...text].length / 1.5)
}

/**
 * 估算整轮 messages 的 prompt token。
 * 每条消息额外加 4 token 的结构开销（role、分隔符、tool_calls 外壳），
 * 这个经验值与 OpenAI 官方计算方式接近，对额度控制已经足够。
 */
export function estimateMessagesTokens(
  messages: Array<{ role: string; content: string | null }>,
): number {
  return messages.reduce((sum, message) => sum + estimateTokens(message.content) + 4, 0)
}

/** 两段用量的合并，避免调用方写重复的加法。 */
export interface TokenUsage {
  promptTokens: number
  completionTokens: number
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
  }
}

export const EMPTY_USAGE: TokenUsage = { promptTokens: 0, completionTokens: 0 }
