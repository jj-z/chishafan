// server/utils/recommendParse.ts
// AI 推荐回复的菜品标记解析与正文清洗（domain REC-02）。
//
// 为什么单独抽成模块：
// 这段逻辑只依赖输入字符串与候选清单，不碰数据库、不发外部请求，是典型的纯函数。
// 抽出来后可以在不启动 Nuxt / 不连数据库的情况下做单元测试，
// 覆盖「菜名匹配容错」「内部 id 兜底清洗」「标记解析失败回退纯文本」等容易回归的边界。

import type { RecommendCandidate } from './dish'

/**
 * 归一化菜名用于比对：去掉空白与常见中文标点，忽略大小写。
 * 模型常把「螺蛳粉」写成「螺 蛳 粉」或加「（招牌）」后缀，归一化后再比对容忍这类改写。
 */
export function normalizeName(name: string): string {
  return name.replace(/[\s（）()【】[\]·・,，、。!！?？:：]/g, '').toLowerCase()
}

/**
 * 把标记里的菜名映射回候选菜品（REC-02）。
 * 匹配顺序：规范化后完全相等 → 互相包含（模型常加后缀）。
 * 匹配不到直接返回 undefined，绝不让模型编造的菜名进入结果。
 */
export function matchCandidateByName(
  raw: string,
  candidates: RecommendCandidate[],
): RecommendCandidate | undefined {
  const target = normalizeName(raw)
  if (!target) return undefined
  return (
    candidates.find((c) => normalizeName(c.name) === target) ??
    candidates.find((c) => {
      const name = normalizeName(c.name)
      return name.includes(target) || target.includes(name)
    })
  )
}

/**
 * 兜底清洗正文里残留的内部 id（如回复里出现「d15 螺蛳粉」）。
 * 理论上模型现在看不到 id，但历史对话内容或模型自行编造仍可能带上；
 * 长 id 优先替换，避免 d1 把 d15 拆成半截。
 */
export function stripInternalIds(text: string, candidates: RecommendCandidate[]): string {
  let out = text
  const ids = candidates.map((c) => c.id).sort((a, b) => b.length - a.length)
  for (const id of ids) {
    out = out.replace(new RegExp(`[\\[【（(]?\\b${id}\\b[\\]】）)]?\\s*`, 'gi'), '')
  }
  return out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 解析模型回复末尾的菜品标记，并清洗正文。
 * 返回「剥掉标记后的正文」（再做一次 id 兜底清洗）与「按菜名匹配到的候选菜品」
 * （保持模型给出的顺序、去重、最多 3 道）。
 *
 * 模型可能不守规矩（不输出标记 / 菜名写错 / JSON 不合法），这里必须容错：
 * 解析失败就当纯文本回复处理，绝不让模型编造的菜名进入结果。
 */
export function parseDishMarker(
  text: string,
  candidates: RecommendCandidate[],
): { text: string; dishes: RecommendCandidate[] } {
  const match = text.match(/<<DISHES:([\s\S]*?)>>/)
  const body = match ? text.slice(0, match.index) : text
  const picked: RecommendCandidate[] = []

  if (match) {
    // noUncheckedIndexedAccess 下 match[1] 类型是 string | undefined：
    // 该捕获组在正则里必然参与匹配，但编译器不知道，先收窄成 string 再用。
    const markerBody = match[1] ?? ''
    let names: string[] = []
    try {
      const parsed = JSON.parse(markerBody) as unknown
      if (Array.isArray(parsed)) names = parsed.filter((v): v is string => typeof v === 'string')
    } catch {
      // JSON 不合法时退一步：直接抓标记内容里的引号字符串。
      names = [...markerBody.matchAll(/"([^"]+)"/g)]
        .map((m) => m[1])
        .filter((v): v is string => typeof v === 'string')
    }
    for (const raw of names) {
      const hit = matchCandidateByName(raw, candidates)
      if (hit && !picked.some((p) => p.id === hit.id)) picked.push(hit)
      if (picked.length >= 3) break
    }
  }

  return { text: stripInternalIds(body, candidates), dishes: picked }
}
