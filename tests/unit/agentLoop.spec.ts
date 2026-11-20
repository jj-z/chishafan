// Agent 循环（D5）。
// 用假实现跑完整循环：不连数据库、不调用真实大模型。

import { describe, expect, it, vi } from 'vitest'
import type { ChatCompletionResult, LlmMessage, LlmToolCall } from '../../server/utils/llm'
import { runAgentLoop, type AgentDeps } from '../../server/utils/agentLoop'
import type { ToolOutcome } from '../../server/utils/tools'

/** 构造一次决策结果；usage 固定为 10/5，方便断言累加。 */
function decision(content: string, toolCalls: LlmToolCall[] = []): ChatCompletionResult {
  return {
    content,
    toolCalls,
    usage: { promptTokens: 10, completionTokens: 5 },
  }
}

function toolCall(name: string, args = '{}'): LlmToolCall {
  return { id: `call-${name}-${args}`, type: 'function', function: { name, arguments: args } }
}

const baseMessages: LlmMessage[] = [{ role: 'user', content: '吃什么' }]

describe('runAgentLoop', () => {
  it('模型不调工具时只做一次决策 + 一次作答', async () => {
    const decide = vi.fn().mockResolvedValue(decision('你好'))
    const answer = vi.fn().mockResolvedValue('你好呀')
    const dispatch = vi.fn()
    const onUsage = vi.fn()

    const result = await runAgentLoop({ decide, answer, dispatch } as AgentDeps, {
      messages: baseMessages,
      canContinue: () => true,
      onUsage,
      onDelta: () => {},
    })

    expect(decide).toHaveBeenCalledTimes(1)
    expect(answer).toHaveBeenCalledTimes(1)
    expect(dispatch).not.toHaveBeenCalled()
    expect(result.text).toBe('你好呀')
    expect(result.steps).toBe(1)
    expect(result.truncated).toBe(false)
    // 决策 1 次 + 作答 1 次，各回调一次 usage
    expect(onUsage).toHaveBeenCalledTimes(2)
  })

  it('执行工具后把 grounded / knowledgeMiss / usedTools 汇总出来', async () => {
    const decide = vi
      .fn()
      .mockResolvedValueOnce(decision('', [toolCall('search_knowledge', '{"query":"宫保鸡丁"}')]))
      .mockResolvedValueOnce(decision(''))
    const answer = vi.fn().mockResolvedValue('宫保鸡丁用鸡肉和花生')
    const dispatch = vi.fn(async (): Promise<ToolOutcome> => ({
      ok: true,
      grounded: true,
      knowledgeMiss: false,
      summary: '命中 1 条知识',
    }))

    const result = await runAgentLoop({ decide, answer, dispatch } as AgentDeps, {
      messages: baseMessages,
      canContinue: () => true,
      onUsage: () => {},
      onDelta: () => {},
    })

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(result.grounded).toBe(true)
    expect(result.knowledgeMiss).toBe(false)
    expect(result.usedTools).toEqual(['search_knowledge'])
    // 两次决策 + 一次作答
    expect(answer).toHaveBeenCalledTimes(1)
  })

  it('达到最大步数时截断，但仍会产出答案', async () => {
    const decide = vi.fn().mockResolvedValue(decision('', [toolCall('get_current_time')]))
    const answer = vi.fn().mockResolvedValue('现在 12:00')
    const dispatch = vi.fn().mockResolvedValue({ ok: true })

    const result = await runAgentLoop({ decide, answer, dispatch } as AgentDeps, {
      messages: baseMessages,
      canContinue: () => true,
      onUsage: () => {},
      onDelta: () => {},
      maxSteps: 3,
    })

    expect(decide).toHaveBeenCalledTimes(3)
    expect(result.truncated).toBe(true)
    expect(result.steps).toBe(3)
    expect(answer).toHaveBeenCalledTimes(1)
  })

  it('同一工具同参数最多执行 2 次，第 3 次直接返回错误', async () => {
    const call = toolCall('get_weather', '{"city":"上海"}')
    const decide = vi.fn().mockResolvedValue(decision('', [call]))
    const answer = vi.fn().mockResolvedValue('上海晴')
    const dispatch = vi.fn().mockResolvedValue({ ok: true })

    await runAgentLoop({ decide, answer, dispatch } as AgentDeps, {
      messages: baseMessages,
      canContinue: () => true,
      onUsage: () => {},
      onDelta: () => {},
      maxSteps: 3,
    })

    // 第 3 次不再真正执行工具
    expect(dispatch).toHaveBeenCalledTimes(2)
  })

  it('额度耗尽（canContinue=false）时不再决策，直接作答', async () => {
    const decide = vi.fn()
    const answer = vi.fn().mockResolvedValue('额度用完了')
    const dispatch = vi.fn()

    const result = await runAgentLoop({ decide, answer, dispatch } as AgentDeps, {
      messages: baseMessages,
      canContinue: () => false,
      onUsage: () => {},
      onDelta: () => {},
    })

    expect(decide).not.toHaveBeenCalled()
    expect(answer).toHaveBeenCalledTimes(1)
    expect(result.truncated).toBe(true)
  })
})
