// AI 推荐回复解析与正文清洗（REC-02）。
// 核心目标：模型只能从候选清单里挑菜，编造的菜名必须被丢弃；
// 正文里残留的内部 id（如「d15 螺蛳粉」）必须清洗掉，不能暴露给用户。

import { describe, expect, it } from 'vitest'
import {
  matchCandidateByName,
  normalizeName,
  parseDishMarker,
  stripInternalIds,
} from '../../server/utils/recommendParse'
import type { RecommendCandidate } from '../../server/utils/dish'

/** 构造一个候选菜品，只填测试需要的字段。 */
function candidate(partial: Partial<RecommendCandidate>): RecommendCandidate {
  return {
    id: 'd1',
    name: '螺蛳粉',
    categoryId: 'c-noodle',
    mealType: 'ANY',
    spicyLevel: 2,
    priceLevel: 2,
    tags: [],
    ingredients: [],
    ...partial,
  }
}

const candidates: RecommendCandidate[] = [
  candidate({ id: 'd1', name: '螺蛳粉' }),
  candidate({ id: 'd2', name: '宫保鸡丁', ingredients: ['鸡肉', '花生'] }),
  candidate({ id: 'd3', name: '麻婆豆腐', ingredients: ['豆腐', '牛肉末'] }),
]

describe('normalizeName', () => {
  it('去掉空白与中英文标点并转小写', () => {
    expect(normalizeName(' 螺 蛳 粉！')).toBe('螺蛳粉')
    expect(normalizeName('Kung Pao Chicken（招牌）')).toBe('kungpaochicken招牌')
  })
})

describe('matchCandidateByName', () => {
  it('规范化后完全相等时命中', () => {
    expect(matchCandidateByName('螺蛳粉', candidates)?.id).toBe('d1')
  })

  it('模型加后缀时用包含关系兜底', () => {
    expect(matchCandidateByName('宫保鸡丁（招牌）', candidates)?.id).toBe('d2')
  })

  it('候选清单里没有的菜返回 undefined，禁止编造', () => {
    expect(matchCandidateByName('不存在的菜', candidates)).toBeUndefined()
  })

  it('空字符串返回 undefined', () => {
    expect(matchCandidateByName('', candidates)).toBeUndefined()
  })
})

describe('stripInternalIds', () => {
  it('把正文里残留的菜品 id 清掉', () => {
    const text = '今天推荐 d1 螺蛳粉 和 d2 宫保鸡丁'
    expect(stripInternalIds(text, candidates)).toBe('今天推荐 螺蛳粉 和 宫保鸡丁')
  })

  it('长 id 优先替换，避免 d1 把 d15 拆半截', () => {
    const cs = [candidate({ id: 'd1', name: 'A' }), candidate({ id: 'd15', name: 'B' })]
    // 'd15' 里包含 'd1'，如果先替换 d1 会把 d15 变成 '5'。
    expect(stripInternalIds('试试 d15 和 d1', cs)).toBe('试试 和')
  })
})

describe('parseDishMarker', () => {
  it('从标记里解析 JSON 数组并按菜名匹配候选', () => {
    const text = '今天吃螺蛳粉和宫保鸡丁吧\n<<DISHES:["螺蛳粉","宫保鸡丁"]>>'
    const result = parseDishMarker(text, candidates)
    expect(result.dishes.map((d) => d.id)).toEqual(['d1', 'd2'])
    // 正文剥掉标记行。
    expect(result.text).toBe('今天吃螺蛳粉和宫保鸡丁吧')
  })

  it('标记里的菜名不在候选时被丢弃，不进入结果', () => {
    const text = '推荐：辣子鸡\n<<DISHES:["辣子鸡"]>>'
    const result = parseDishMarker(text, candidates)
    expect(result.dishes).toEqual([])
  })

  it('没有标记时当作纯文本回复，dishes 为空', () => {
    const text = '今天天气不错，随便吃点吧'
    const result = parseDishMarker(text, candidates)
    expect(result.dishes).toEqual([])
    expect(result.text).toBe(text)
  })

  it('标记 JSON 不合法时退化为抓引号字符串', () => {
    // 故意写一个非法 JSON（缺右括号），验证回退路径仍能解析出菜名。
    const text = '推荐\n<<DISHES:["麻婆豆腐">>'
    const result = parseDishMarker(text, candidates)
    expect(result.dishes.map((d) => d.id)).toEqual(['d3'])
  })

  it('最多返回 3 道菜，多余的被截断', () => {
    const four = [...candidates, candidate({ id: 'd4', name: '鱼香肉丝' })]
    const text = '<<DISHES:["螺蛳粉","宫保鸡丁","麻婆豆腐","鱼香肉丝"]>>'
    const result = parseDishMarker(text, four)
    expect(result.dishes).toHaveLength(3)
  })

  it('重复菜名去重，只保留第一次出现', () => {
    const text = '<<DISHES:["螺蛳粉","螺蛳粉"]>>'
    const result = parseDishMarker(text, candidates)
    expect(result.dishes).toHaveLength(1)
  })

  it('正文里的内部 id 被清洗后再返回', () => {
    const text = '试试 d1 螺蛳粉\n<<DISHES:["螺蛳粉"]>>'
    const result = parseDishMarker(text, candidates)
    expect(result.text).toBe('试试 螺蛳粉')
    expect(result.dishes.map((d) => d.id)).toEqual(['d1'])
  })
})
