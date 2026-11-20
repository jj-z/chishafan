// 推荐效果埋点契约（P2-09 / TRACK-01~04）：前端队列与 /api/tracking/recommend-events 共用。
// 枚举值与 Prisma 的 RecommendEventType / RecommendSource 保持一致，新增值必须两边同步。

import { z } from 'zod'

/** IMPRESSION=推荐结果曝光；CLICK=点开菜品卡片；DINE=点「就吃它」成功记录就餐。 */
export const recommendEventTypeEnum = z.enum(['IMPRESSION', 'CLICK', 'DINE'])

/** RANDOM=首页随机一餐；AI=AI 聊天推荐。 */
export const recommendSourceEnum = z.enum(['RANDOM', 'AI'])

/**
 * 单条埋点。eventId 由前端生成：服务端用它做幂等去重，
 * 批量上报重试时同一事件不会重复计数（TRACK-02）。
 */
export const recommendEventInputSchema = z.object({
  eventId: z.string().trim().min(8).max(64),
  type: recommendEventTypeEnum,
  source: recommendSourceEnum,
  dishId: z.string().min(1),
})

/** 批量上报上限 50：队列按 2s / 20 条触发，正常远小于上限，限制只为防止恶意大包。 */
export const recommendEventsBodySchema = z.object({
  events: z.array(recommendEventInputSchema).min(1).max(50),
})

/** 返回实际写入行数：重复 eventId 或非法 dishId 会被过滤，因此可能小于提交条数。 */
export const recommendEventsOkSchema = z.object({
  accepted: z.number().int().min(0),
})

export type RecommendEventType = z.infer<typeof recommendEventTypeEnum>
export type RecommendSource = z.infer<typeof recommendSourceEnum>
export type RecommendEventInput = z.infer<typeof recommendEventInputSchema>
export type RecommendEventsBody = z.infer<typeof recommendEventsBodySchema>
export type RecommendEventsOk = z.infer<typeof recommendEventsOkSchema>
