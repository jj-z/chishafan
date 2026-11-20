// 推荐环境上下文：IP 城市 + 当前天气。
//
// 设计约束（N19）：
// 1. 只用免 Key 公共服务：ip-api.com 做 IP 定位、wttr.in 做天气；
// 2. 任何外部服务超时/报错都必须 fail-open，返回 city/weather 为 null，推荐流程继续；
// 3. 只保留城市级信息，不落库、不回传经纬度，避免隐私问题；
// 4. 服务端缓存（非用户数据）降低第三方调用频率，避免触发限流。

import type { H3Event } from 'h3'
import { getRequestIP } from 'h3'
import type { WeatherKind } from '../../shared/schemas/dish'

/**
 * 天气 → 餐食建议（与 recommend.post.ts 里 system prompt 的口径保持一致）。
 * 只给方向建议（清淡/热汤），不指定具体菜名，避免越权替用户决定。
 */
const WEATHER_MEAL_HINT: Record<WeatherKind, string | null> = {
  HOT: '天气炎热，适合清淡解暑的口味',
  COLD: '天气寒冷，适合热汤暖胃、热量高一些的口味',
  RAIN: '下雨天，适合热汤热食，驱寒祛湿',
  SNOW: '下雪天，适合热乎顶饱、暖身的口味',
  MILD: '天气温和，口味不限',
  UNKNOWN: null,
}

/**
 * 地域 → 菜系口味提示。
 * 与 recommendBias.ts 的 REGION_CUISINE_BIAS 对应，但这里返回人能读的一句话，
 * 让模型能向用户解释「为什么推荐这个菜系」，而不是只在权重里默默生效。
 */
const REGION_CUISINE_HINT: Array<{ keywords: string[]; hint: string }> = [
  { keywords: ['四川', '重庆', '湖南', '贵州', '江西'], hint: '当地偏好川菜等麻辣口味' },
  {
    keywords: ['陕西', '山西', '河南', '甘肃', '新疆', '宁夏', '青海'],
    hint: '当地偏好面食为主的北方口味',
  },
  { keywords: ['广东', '广西', '福建', '海南'], hint: '当地偏好粤菜，口味清淡、讲究煲汤' },
  { keywords: ['浙江', '江苏', '上海'], hint: '当地偏好江浙菜，口味偏甜鲜' },
  {
    keywords: ['山东', '河北', '北京', '天津', '辽宁', '吉林', '黑龙江', '内蒙古'],
    hint: '当地偏好北方家常菜与烧烤',
  },
  { keywords: ['云南', '西藏'], hint: '当地偏好云南菜等西南风味' },
]

/** 基于天气类型返回一句餐食建议；天气未知返回 null，由调用方决定是否提示。 */
export function weatherMealHint(kind: WeatherKind | undefined | null): string | null {
  if (!kind) return null
  return WEATHER_MEAL_HINT[kind] ?? null
}

/** 基于省份/城市返回地域口味提示；无匹配返回 null。 */
export function regionCuisineHint(province: string | null, city: string | null): string | null {
  const text = `${province ?? ''}${city ?? ''}`
  if (!text) return null
  for (const rule of REGION_CUISINE_HINT) {
    if (rule.keywords.some((keyword) => text.includes(keyword))) {
      return rule.hint
    }
  }
  return null
}

/** 服务端内部使用的环境信息，比接口 DTO 多一个省份，用于地域口味映射。 */
export interface AmbientInfo {
  city: string | null
  province: string | null
  weather: {
    tempC: number
    text: string
    kind: WeatherKind
  } | null
}

interface GeoInfo {
  city: string
  province: string | null
  lat: number | null
  lon: number | null
}

interface IpApiResponse {
  status: string
  message?: string
  city?: string
  regionName?: string
  lat?: number
  lon?: number
}

interface WttrResponse {
  current_condition?: Array<{
    temp_C?: string
    weatherDesc?: Array<{ value?: string }>
  }>
}

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

const GEO_TTL_MS = 60 * 60 * 1000 // 城市很少变化，缓存 1 小时
const WEATHER_TTL_MS = 30 * 60 * 1000 // 天气 30 分钟刷新一次
const NEGATIVE_TTL_MS = 5 * 60 * 1000 // 失败结果短暂缓存，避免连续请求反复打第三方

// 缓存是进程级的公共数据（城市/天气），不包含用户信息，不存在跨用户泄漏问题。
const geoCache = new Map<string, CacheEntry<GeoInfo | null>>()
const weatherCache = new Map<string, CacheEntry<AmbientInfo['weather']>>()

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const hit = cache.get(key)
  if (!hit) return undefined
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key)
    return undefined
  }
  return hit.value
}

/** 内网/回环地址无法用于 IP 定位，本地开发会走到这里并直接降级。 */
function isPrivateIp(ip: string): boolean {
  const value = ip.replace(/^::ffff:/, '')
  return (
    value === '::1' ||
    value === 'localhost' ||
    value.startsWith('127.') ||
    value.startsWith('10.') ||
    value.startsWith('192.168.') ||
    value.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(value) ||
    /^f[cd][0-9a-f]{2}:/i.test(value) ||
    /^fe[89ab][0-9a-f]:/i.test(value)
  )
}

/** 用 IP 换城市。失败返回 null，调用方按“无环境信息”继续推荐。 */
async function resolveGeo(ip: string): Promise<GeoInfo | null> {
  const cached = readCache(geoCache, ip)
  if (cached !== undefined) return cached

  try {
    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,city,regionName,lat,lon&lang=zh-CN`
    const data = await $fetch<IpApiResponse>(url, { timeout: 1500, retry: 0 })
    if (data.status !== 'success' || !data.city) {
      geoCache.set(ip, { value: null, expiresAt: Date.now() + NEGATIVE_TTL_MS })
      return null
    }
    const geo: GeoInfo = {
      city: data.city,
      province: data.regionName ?? null,
      lat: typeof data.lat === 'number' ? data.lat : null,
      lon: typeof data.lon === 'number' ? data.lon : null,
    }
    geoCache.set(ip, { value: geo, expiresAt: Date.now() + GEO_TTL_MS })
    return geo
  } catch {
    // 网络不可用、超时、返回结构异常都按“没有环境信息”处理，绝不阻塞推荐。
    geoCache.set(ip, { value: null, expiresAt: Date.now() + NEGATIVE_TTL_MS })
    return null
  }
}

/**
 * wttr.in 的 lang=zh 目前仍可能返回英文天气描述（实测 Sunny / Patchy rain nearby），
 * 这里把常见描述映射成中文，既用于展示也用于后续 classifyWeather。
 * 未命中的文案原样返回，保证新增天气类型不会丢信息。
 */
function localizeWeatherText(text: string): string {
  const value = text.trim()
  const lower = value.toLowerCase()
  if (/thunder|storm/.test(lower)) return '雷雨'
  if (/heavy rain/.test(lower)) return '大雨'
  if (/snow|blizzard/.test(lower)) return '雪'
  if (/sleet|freezing rain/.test(lower)) return '雨夹雪'
  if (/drizzle/.test(lower)) return '毛毛雨'
  if (/rain|shower/.test(lower)) return '雨'
  if (/sunny|clear/.test(lower)) return '晴'
  if (/partly cloudy/.test(lower)) return '多云'
  if (/cloudy/.test(lower)) return '阴'
  if (/overcast/.test(lower)) return '阴'
  if (/mist|fog/.test(lower)) return '雾'
  if (/haze|smoke/.test(lower)) return '霾'
  return value
}

/** 把第三方天气文案归一成有限枚举，推荐权重只依赖枚举，不依赖文案格式。 */
function classifyWeather(tempC: number, text: string): WeatherKind {
  const normalized = text.toLowerCase()
  if (/雪|snow|sleet|blizzard/.test(normalized)) return 'SNOW'
  if (/雨|rain|shower|thunder|storm|drizzle/.test(normalized)) return 'RAIN'
  if (tempC >= 30) return 'HOT'
  if (tempC <= 10) return 'COLD'
  return 'MILD'
}

/** 按城市或经纬度取天气。优先经纬度，城市名作为开发环境的手动覆盖入口。 */
async function resolveWeather(geo: GeoInfo): Promise<AmbientInfo['weather']> {
  const cacheKey =
    geo.lat != null && geo.lon != null
      ? `${geo.lat.toFixed(2)},${geo.lon.toFixed(2)}`
      : `city:${geo.city}`
  const cached = readCache(weatherCache, cacheKey)
  if (cached !== undefined) return cached

  try {
    const target =
      geo.lat != null && geo.lon != null ? `${geo.lat},${geo.lon}` : encodeURIComponent(geo.city)
    const data = await $fetch<WttrResponse>(`https://wttr.in/${target}?format=j1&lang=zh`, {
      // wttr.in 冷启动/跨境网络偶发 2s+，4s 是「拿到天气」与「不拖慢首页」的折中。
      timeout: 4000,
      retry: 0,
      headers: { 'User-Agent': 'chishafan-mvp' },
      // wttr.in 的 Content-Type 不是 application/json，ofetch 默认不会自动解析，
      // 会把整个 JSON 文本当成字符串返回。强制 responseType: 'json' 让 ofetch 做 JSON.parse。
      responseType: 'json',
    })
    const current = data.current_condition?.[0]
    const tempC = Number(current?.temp_C)
    if (!Number.isFinite(tempC)) {
      weatherCache.set(cacheKey, { value: null, expiresAt: Date.now() + NEGATIVE_TTL_MS })
      return null
    }
    const text = localizeWeatherText(current?.weatherDesc?.[0]?.value ?? '') || '未知'
    const weather = { tempC, text, kind: classifyWeather(tempC, text) }
    weatherCache.set(cacheKey, { value: weather, expiresAt: Date.now() + WEATHER_TTL_MS })
    return weather
  } catch {
    weatherCache.set(cacheKey, { value: null, expiresAt: Date.now() + NEGATIVE_TTL_MS })
    return null
  }
}

/**
 * 按城市名取天气（AI 的 get_weather 技能用）。
 * 复用首页同一套缓存与归一逻辑，避免两处天气口径不一致；失败返回 null，
 * 由工具如实告诉模型「天气服务暂时不可用」，禁止编造天气。
 */
export async function getWeatherByCity(city: string): Promise<AmbientInfo['weather']> {
  const trimmed = city.trim()
  if (!trimmed) return null
  return resolveWeather({ city: trimmed, province: null, lat: null, lon: null })
}

/**
 * 获取当前请求的推荐环境。
 * AMBIENT_DEV_CITY 是可选的本地开发覆盖：localhost 的 IP 是回环地址，
 * 无法做 IP 定位，设置该环境变量后可以按城市名验证天气链路。
 */
export async function getAmbientContext(event: H3Event): Promise<AmbientInfo> {
  const devCity = process.env.AMBIENT_DEV_CITY?.trim()
  if (devCity) {
    const weather = await resolveWeather({ city: devCity, province: null, lat: null, lon: null })
    return { city: devCity, province: null, weather }
  }

  const ip = getRequestIP(event, { xForwardedFor: true })
  if (!ip || isPrivateIp(ip)) {
    return { city: null, province: null, weather: null }
  }

  const geo = await resolveGeo(ip)
  if (!geo) return { city: null, province: null, weather: null }

  const weather = await resolveWeather(geo)
  return { city: geo.city, province: geo.province, weather }
}
