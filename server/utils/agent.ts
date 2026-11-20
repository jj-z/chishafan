// Agent 业务接线（D5）。
//
// 真实依赖在这里组装：决策用非流式 chatCompletion（需要完整 tool_calls），
// 作答用流式 streamChatCompletion（打字机效果），工具调度走 dispatchTool。
// 纯循环逻辑在 agentLoop.ts，方便单测。

import type { LlmConfig, LlmMessage } from './llm'
import { chatCompletion, streamChatCompletion } from './llm'
import { runAgentLoop, type AgentDeps, type AgentParams, type AgentResult } from './agentLoop'
import { dispatchTool, type ToolContext } from './tools'
import { getOpenAiTools } from './skills'
import type { TokenUsage } from './tokenEstimate'

/**
 * 业务入口：把真实依赖（LLM + 工具调度）接到 runAgentLoop 上。
 * 决策阶段 max_tokens 压到 200：它只需要「要不要调工具、调哪个」，不需要写正文。
 */
export async function runAgent(options: {
  config: LlmConfig
  messages: LlmMessage[]
  toolContext: ToolContext
  canContinue: () => boolean
  onUsage: (usage: TokenUsage) => Promise<void> | void
  onDelta: (text: string) => void
  onTool?: AgentParams['onTool']
  signal?: AbortSignal
}): Promise<AgentResult> {
  // 技能从 Nitro server assets 读取，首次调用会读盘，之后命中缓存。
  const tools = await getOpenAiTools()

  const deps: AgentDeps = {
    decide: (messages) =>
      chatCompletion(options.config, {
        messages,
        tools,
        temperature: 0.2,
        maxTokens: 200,
        signal: options.signal,
      }),
    answer: (messages, onDelta) =>
      streamChatCompletion(options.config, {
        messages,
        onDelta,
        signal: options.signal,
      }),
    dispatch: (name, argumentsJson) => dispatchTool(name, argumentsJson, options.toolContext),
  }

  return runAgentLoop(deps, {
    messages: options.messages,
    canContinue: options.canContinue,
    onUsage: options.onUsage,
    onDelta: options.onDelta,
    onTool: options.onTool,
  })
}
