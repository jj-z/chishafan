// 推荐上下文：把「用户偏好 + 地域 + 天气」合并成随机推荐可消费的权重。
// 后续 AI 推荐也必须通过这里拿上下文，禁止另写一套地域/天气规则。

import type { H3Event } from 'h3'
import type { AmbientInfo } from './ambient'
import type { Preference } from '../../shared/schemas/preference'
import { DEFAULT_PREFERENCE } from '../../shared/schemas/preference'
import { getAmbientContext } from './ambient'
import { isPreferenceApplied, loadPreference } from './preference'
import { buildCategoryBias } from './recommendBias'

export interface RecommendContext {
  preference: Preference
  ambient: AmbientInfo
  /** 是否真的应用了用户偏好（默认值不算），用于前端提示。 */
  preferenceApplied: boolean
  /** 菜系 id → 权重倍率；由地域与天气叠加得出。 */
  categoryBias: Record<string, number>
  /** 高温天气下降低重辣菜权重，属于软偏好。 */
  hotWeather: boolean
}

/**
 * 加载一次推荐所需的全部上下文。游客使用默认偏好，但仍会获得地域/天气软偏好。
 * 偏好与外部环境并行请求：两者互不依赖，串行会白白增加首页首屏等待。
 */
export async function loadRecommendContext(
  event: H3Event,
  userId: string | null,
): Promise<RecommendContext> {
  const [preference, ambient] = await Promise.all([
    userId ? loadPreference(userId) : Promise.resolve(DEFAULT_PREFERENCE),
    getAmbientContext(event),
  ])

  return {
    preference,
    ambient,
    preferenceApplied: userId ? isPreferenceApplied(preference) : false,
    categoryBias: buildCategoryBias(ambient),
    hotWeather: ambient.weather?.kind === 'HOT',
  }
}

/** 只把城市与天气暴露给前端，省份与经纬度属于服务端内部信息。 */
export function toAmbientDto(context: RecommendContext) {
  return {
    city: context.ambient.city,
    weather: context.ambient.weather,
  }
}
