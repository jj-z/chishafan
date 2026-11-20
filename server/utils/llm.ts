// LLM 调用封装（P1）：只负责「怎么调大模型」，不负责推荐业务逻辑。
//
// 设计约束（决策 a）：
// 1. 服务商通过环境变量切换（baseURL / model / key 都在 .env），代码只认 OpenAI 兼容的
//    chat/completions 协议——智谱 GLM 与 DeepSeek 都提供该协议，换供应商不改代码；
// 2. 不引入任何 SDK 依赖：流式请求用 Node 原生 fetch + ReadableStream 手动解析 SSE，
//    协议本身很简单（`data: {json}` 行 + `data: [DONE]` 结束），没必要为此加包；
// 3. 所有失败都归一成带中文提示的普通 Error，调用方（SSE 接口）直接把 message 发给前端。

import { estimateMessagesTokens, estimateTokens, type TokenUsage } from './tokenEstimate'

export interface LlmConfig {
  baseUrl: string
  apiKey: string
  model: string
  /** 整次请求（含流式生成）的总超时。glm-4-flash 生成 300 token 通常 10s 内，30s 是宽松兜底。 */
  timeoutMs: number
}

/** chat/completions 协议的消息结构。tool 角色用于回传工具执行结果。 */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  /** assistant 请求工具时 content 可能为空，因此允许 null。 */
  content: string | null
  /** 仅 assistant 消息：模型发起的工具调用。 */
  tool_calls?: LlmToolCall[]
  /** 仅 tool 消息：对应哪一次工具调用。 */
  tool_call_id?: string
}

/** 模型发起的一次 function call。 */
export interface LlmToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    /** 上游返回的是 JSON 字符串，需要调用方自行解析与校验。 */
    arguments: string
  }
}

/** 传给 OpenAI 兼容接口的 tools 定义。 */
export interface LlmToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/**
 * 读取 LLM 配置。key 未配置时抛出带明确指引的错误，
 * 让接口把「去 .env 配置 NUXT_LLM_API_KEY」透传给前端，而不是报一个模糊的 500。
 */
export function getLlmConfig(): LlmConfig {
  const baseUrl =
    process.env.NUXT_LLM_BASE_URL?.trim() || 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
  const model = process.env.NUXT_LLM_MODEL?.trim() || 'glm-4-flash'
  const apiKey = process.env.NUXT_LLM_API_KEY?.trim() ?? ''
  if (!apiKey) {
    throw new Error('AI 服务尚未配置：请在服务端 .env 中填写 NUXT_LLM_API_KEY')
  }
  return { baseUrl, apiKey, model, timeoutMs: 30_000 }
}

/** 把上游的各种失败翻译成用户能看懂的中文提示。上游原始报错留在服务端日志里排查。 */
function normalizeLlmError(status: number, body: string): Error {
  console.error(`[llm] 上游返回 ${status}: ${body.slice(0, 300)}`)
  if (status === 401 || status === 403) {
    return new Error('AI 服务鉴权失败，请检查 .env 里的 NUXT_LLM_API_KEY 是否有效')
  }
  if (status === 429) {
    return new Error('AI 服务请求太频繁了，稍等几秒再试')
  }
  if (status >= 500) {
    return new Error('AI 服务暂时不可用，请稍后再试')
  }
  return new Error('AI 服务拒绝了这次请求，请换个说法再试')
}

interface StreamOptions {
  messages: LlmMessage[]
  /** 每收到一段增量文本就回调一次；调用方用它向前端写 SSE delta 事件。 */
  onDelta: (text: string) => void
  /** 客户端断开时由调用方 abort，避免前端已经走了服务端还在白白消耗模型额度。 */
  signal?: AbortSignal
}

/**
 * 发起一次流式对话，返回模型完整回复文本。
 *
 * SSE 解析说明：OpenAI 兼容协议下每个事件是若干行、以 `data: ` 开头，事件间用空行分隔；
 * 内容增量在 `choices[0].delta.content`，`data: [DONE]` 表示结束。
 * 逐行解析而不是按分隔符切块：分块边界可能把一行切成两半，用 buffer 拼回完整行再处理。
 *
 * 重试策略：只在「一个字都没吐出来」时重试一次（连接抖动、临时 5xx）；
 * 已经开始流式输出后失败不能重试——前端会看到内容重复。
 */
export async function streamChatCompletion(
  config: LlmConfig,
  options: StreamOptions,
): Promise<string> {
  let streamed = ''
  const trackDelta = (text: string) => {
    streamed += text
    options.onDelta(text)
  }

  try {
    return await attemptStream(config, options, trackDelta)
  } catch (err) {
    // 一个字都没发出去时才值得重试；超时与网络错误是主要场景。
    if (streamed.length === 0) {
      console.warn('[llm] 首次请求失败且无输出，重试一次:', (err as Error).message)
      return await attemptStream(config, options, trackDelta)
    }
    throw err
  }
}

async function attemptStream(
  config: LlmConfig,
  options: StreamOptions,
  onDelta: (text: string) => void,
): Promise<string> {
  // 外层 signal（客户端断开）与超时信号二合一：任一触发都中止上游请求。
  const timeoutSignal = AbortSignal.timeout(config.timeoutMs)
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal

  let res: Response
  try {
    res = await fetch(config.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: options.messages,
        stream: true,
        // 温度取 0.8：美食推荐需要一点多样性，但太高会开始胡编候选之外的菜。
        temperature: 0.8,
        max_tokens: 800,
      }),
      signal,
    })
  } catch {
    if (timeoutSignal.aborted) throw new Error('AI 服务响应超时了，请稍后再试')
    throw new Error('连接 AI 服务失败，请检查网络或稍后再试')
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw normalizeLlmError(res.status, body)
  }
  if (!res.body) {
    throw new Error('AI 服务没有返回内容，请稍后再试')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  const handleLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return
    const payload = trimmed.slice(5).trim()
    if (!payload || payload === '[DONE]') return
    try {
      const json = JSON.parse(payload) as {
        choices?: Array<{ delta?: { content?: string | null } }>
      }
      const delta = json.choices?.[0]?.delta?.content
      if (delta) {
        full += delta
        onDelta(delta)
      }
    } catch {
      // 单行 JSON 解析失败直接跳过：上游偶发心跳/注释行，不值得让整次推荐失败。
    }
  }

  // 流式读取循环：done 表示上游正常结束（含 [DONE]）；读的过程中请求被 abort 会抛错，
  // 由调用方（SSE 接口）统一兜底成 error 事件。
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    // 最后一段可能是被切断的半行，留到下一轮和后续数据拼接。
    buffer = lines.pop() ?? ''
    for (const line of lines) handleLine(line)
  }
  if (buffer) handleLine(buffer)

  if (!full.trim()) {
    throw new Error('AI 服务没有返回内容，请稍后再试')
  }
  return full
}

interface ChatOptions {
  messages: LlmMessage[]
  /** 传入后模型可以发起 function call；不传表示只能直接作答。 */
  tools?: LlmToolDefinition[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

export interface ChatCompletionResult {
  content: string
  toolCalls: LlmToolCall[]
  usage: TokenUsage
}

/**
 * 非流式对话（D5）：Agent 的「决策阶段」用它，因为需要完整读取 tool_calls。
 *
 * 为什么不直接用流式解析 tool_calls：
 * OpenAI 兼容协议的流式 tool_calls 是分片的（id/name/arguments 分多条 delta 拼），
 * 解析复杂度高且各家实现细节不一致；决策阶段本来也不需要打字机效果，
 * 用非流式换取稳定与简单，最终作答再走流式。
 */
export async function chatCompletion(
  config: LlmConfig,
  options: ChatOptions,
): Promise<ChatCompletionResult> {
  const timeoutSignal = AbortSignal.timeout(config.timeoutMs)
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal

  let res: Response
  try {
    res = await fetch(config.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: options.messages,
        stream: false,
        // 决策阶段温度调低：需要的是稳定地选择工具，而不是发挥创意。
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 600,
        ...(options.tools?.length ? { tools: options.tools } : {}),
      }),
      signal,
    })
  } catch {
    if (timeoutSignal.aborted) throw new Error('AI 服务响应超时了，请稍后再试')
    throw new Error('连接 AI 服务失败，请检查网络或稍后再试')
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw normalizeLlmError(res.status, body)
  }

  const json = (await res.json()) as {
    choices?: Array<{
      message?: { content?: string | null; tool_calls?: LlmToolCall[] }
    }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }

  const message = json.choices?.[0]?.message
  const content = message?.content ?? ''
  const toolCalls = message?.tool_calls ?? []

  // 上游没有返回 usage 时退回本地估算：额度记账不能因为字段缺失就漏记。
  const usage: TokenUsage = {
    promptTokens: json.usage?.prompt_tokens ?? estimateMessagesTokens(options.messages),
    completionTokens:
      json.usage?.completion_tokens ??
      estimateTokens(content) + estimateTokens(JSON.stringify(toolCalls)),
  }

  if (!content.trim() && !toolCalls.length) {
    throw new Error('AI 服务没有返回内容，请稍后再试')
  }

  return { content, toolCalls, usage }
}
