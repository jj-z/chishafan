// 关键词降级检索评分（D3）。
// 这是 embedding 不可用时的唯一检索手段，必须能正确处理中文问句。

import { describe, expect, it } from 'vitest'
import { keywordScore, normalizeQuery, toBigrams } from '../../server/utils/knowledgeScore'

describe('normalizeQuery', () => {
  it('去掉标点、空白与常见问句虚词', () => {
    expect(normalizeQuery('请问有没有不辣的菜？')).toBe('不辣菜')
    expect(normalizeQuery('宫保鸡丁怎么做')).toBe('宫保鸡丁')
  })
})

describe('toBigrams', () => {
  it('长度大于 2 时返回相邻字符组合', () => {
    expect(toBigrams('宫保鸡')).toEqual(['宫保', '保鸡'])
  })

  it('长度不超过 2 时返回整串，避免单字查询永远匹配不到', () => {
    expect(toBigrams('辣')).toEqual(['辣'])
    expect(toBigrams('米饭')).toEqual(['米饭'])
    expect(toBigrams('')).toEqual([])
  })
})

describe('keywordScore', () => {
  it('命中越多得分越高', () => {
    const doc = '菜名：宫保鸡丁\n主要食材：鸡肉、花生\n辣度：中辣'
    expect(keywordScore('宫保鸡丁', doc)).toBe(1)
    expect(keywordScore('宫保鸡丁的做法', doc)).toBeGreaterThan(0.5)
  })

  it('完全无关返回 0', () => {
    expect(keywordScore('寿司', '菜名：宫保鸡丁\n主要食材：鸡肉')).toBe(0)
  })

  it('单字关键词也能匹配', () => {
    expect(keywordScore('辣', '菜名：水煮鱼\n辣度：中辣')).toBeGreaterThan(0)
  })
})
