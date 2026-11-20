// 地域 / 天气 → 菜系权重（PREF-06）。
// 单独抽成纯函数模块，方便单元测试：这里不碰数据库、不发外部请求，
// 输入只有环境信息，输出是「菜系 id → 倍率」的纯映射。

import type { AmbientInfo } from './ambient'

/**
 * 地域口味映射：只做弱先验，不是“哪里人一定吃什么”。
 * 命中省份/城市关键词时给对应菜系加权，用户显式喜欢/不喜欢仍然优先。
 */
const REGION_CUISINE_BIAS: Array<{ keywords: string[]; weights: Record<string, number> }> = [
  { keywords: ['四川', '重庆', '湖南', '贵州', '江西'], weights: { 'c-sichuan': 1.6 } },
  {
    keywords: ['陕西', '山西', '河南', '甘肃', '新疆', '宁夏', '青海'],
    weights: { 'c-noodle': 1.5 },
  },
  {
    keywords: ['广东', '广西', '福建', '海南', '浙江', '江苏', '上海', '台湾'],
    weights: { 'c-soup': 1.3, 'c-home': 1.2 },
  },
  {
    keywords: ['山东', '河北', '北京', '天津', '辽宁', '吉林', '黑龙江', '内蒙古'],
    weights: { 'c-home': 1.2, 'c-bbq': 1.2 },
  },
  { keywords: ['云南', '西藏'], weights: { 'c-noodle': 1.2 } },
]

/** 天气 → 菜系偏好。高温偏清淡，低温/雨雪偏热汤与热食。 */
const WEATHER_CUISINE_BIAS: Record<string, Record<string, number>> = {
  HOT: { 'c-soup': 1.2, 'c-home': 1.15, 'c-fast': 1.1 },
  COLD: { 'c-soup': 1.5, 'c-sichuan': 1.4, 'c-noodle': 1.3 },
  RAIN: { 'c-soup': 1.5, 'c-noodle': 1.3 },
  SNOW: { 'c-soup': 1.4, 'c-sichuan': 1.4, 'c-noodle': 1.2 },
}

/** 多次命中同一菜系时权重相乘，但限制上限，避免单一菜系被无限放大（PREF-06 上限 2.5）。 */
const MAX_BIAS = 2.5

function mergeBias(target: Record<string, number>, source: Record<string, number>) {
  for (const [categoryId, weight] of Object.entries(source)) {
    target[categoryId] = Math.min((target[categoryId] ?? 1) * weight, MAX_BIAS)
  }
}

/** 把城市/省份与天气合并成菜系倍率；无信息时返回空对象（等价于全部 ×1）。 */
export function buildCategoryBias(ambient: AmbientInfo): Record<string, number> {
  const bias: Record<string, number> = {}
  const regionText = `${ambient.province ?? ''}${ambient.city ?? ''}`
  if (regionText) {
    for (const rule of REGION_CUISINE_BIAS) {
      if (rule.keywords.some((keyword) => regionText.includes(keyword))) {
        mergeBias(bias, rule.weights)
      }
    }
  }
  const weatherKind = ambient.weather?.kind
  if (weatherKind && WEATHER_CUISINE_BIAS[weatherKind]) {
    mergeBias(bias, WEATHER_CUISINE_BIAS[weatherKind]!)
  }
  return bias
}
