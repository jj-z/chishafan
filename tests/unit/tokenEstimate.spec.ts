// Token 估算与用量合并（D6）。
// 目标是「宁可估高、不可估低」：估少了会让用户超出真实额度。

import { describe, expect, it } from 'vitest'
import {
  addUsage,
  EMPTY_USAGE,
  estimateMessagesTokens,
  estimateTokens,
} from '../../server/utils/tokenEstimate'

describe('estimateTokens', () => {
  it('空文本为 0', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens(null)).toBe(0)
  })

  it('按字符数 / 1.5 向上取整', () => {
    expect(estimateTokens('你好')).toBe(2)
    expect(estimateTokens('吃啥饭')).toBe(2)
    // 6 个字符 → 4 token（向上取整），高于按 1 字 1 token 的直觉值。
    expect(estimateTokens('今天吃什么饭')).toBe(4)
  })

  it('中文与英文统一按字符数估算', () => {
    expect(estimateTokens('hello')).toBe(4)
  })
})

describe('estimateMessagesTokens', () => {
  it('每条消息额外计入 4 token 结构开销', () => {
    expect(
      estimateMessagesTokens([
        { role: 'user', content: '你好' },
        { role: 'assistant', content: '你好' },
      ]),
    ).toBe(2 + 4 + 2 + 4)
  })
})

describe('addUsage', () => {
  it('分别累加输入与输出', () => {
    expect(
      addUsage({ promptTokens: 10, completionTokens: 5 }, { promptTokens: 3, completionTokens: 2 }),
    ).toEqual({
      promptTokens: 13,
      completionTokens: 7,
    })
  })

  it('EMPTY_USAGE 是零值', () => {
    expect(addUsage(EMPTY_USAGE, { promptTokens: 1, completionTokens: 1 })).toEqual({
      promptTokens: 1,
      completionTokens: 1,
    })
  })
})
