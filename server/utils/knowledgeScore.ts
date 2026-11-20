// 关键词检索的评分逻辑（D3 的降级路径）。
//
// 为什么不用第三方分词：中文分词需要词典与额外依赖，而这里的用途只是
// 「embedding 不可用时别让问答直接瘫痪」。用字符二元组（bigram）做重叠计数，
// 零依赖、对中文足够有效，并且可以单测。
// 独立成无副作用模块，避免单测 import 时把 Prisma 连接带进来（pitfalls #12）。

/** 问句里的高频虚词/口头语：它们几乎出现在每个问题里，会把无关文档的分数抬高。 */
const STOP_PHRASES = [
  '请问',
  '我想',
  '想吃',
  '可以',
  '能不能',
  '有没有',
  '怎么做',
  '咋做',
  '做法',
  '怎么样',
  '怎么',
  '如何',
  '什么',
  '哪些',
  '哪个',
  '是什么',
  '是多少',
  '多少钱',
  '好吃吗',
  '适合',
  '推荐',
  '一下',
  '这个',
  '那个',
  '的话',
  // 单个虚词也要去掉：中文问句里「的/了/吗/呢/吧」几乎不携带检索信息，
  // 留着会让「宫保鸡丁的做法」与「宫保鸡丁」的相似度被无谓拉低。
  '的',
  '了',
  '吗',
  '呢',
  '吧',
]

/** 归一化：转小写、去掉空白与标点、再去掉停用短语。 */
export function normalizeQuery(query: string): string {
  let text = query.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
  for (const phrase of STOP_PHRASES) text = text.split(phrase).join('')
  return text
}

/**
 * 生成字符二元组。
 * 长度 ≤2 时直接返回整串：否则「辣」这种单字查询会得到空数组，永远匹配不到。
 */
export function toBigrams(text: string): string[] {
  const chars = [...text]
  if (chars.length === 0) return []
  if (chars.length <= 2) return [text]
  return chars.slice(0, -1).map((char, index) => char + chars[index + 1])
}

/**
 * 计算关键词匹配得分（0~1）：查询的二元组有多大比例在文档里出现过。
 * 只用于降级路径的相对排序，不能与余弦相似度直接比较。
 */
export function keywordScore(query: string, document: string): number {
  const terms = toBigrams(normalizeQuery(query))
  if (!terms.length) return 0
  const haystack = document.toLowerCase()
  let hits = 0
  for (const term of terms) {
    if (haystack.includes(term)) hits += 1
  }
  return hits / terms.length
}
