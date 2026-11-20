import { z } from 'zod'
import { dishSchema } from './dish'

// 反馈动作契约（PREF-11 / PREF-12）：前端首页/反馈页与 /api/feedback 共用同一份 schema。
// LIKE = 喜欢（推荐软加权），DISLIKE = 不感兴趣（7 天内硬排除）。
export const feedbackActionEnum = z.enum(['LIKE', 'DISLIKE'])

/** 标记反馈：只需要菜品 id 与动作，用户身份来自登录会话，禁止由前端传 userId。 */
export const feedbackBodySchema = z.object({
  dishId: z.string().min(1),
  /** 默认 DISLIKE：老的「不感兴趣」调用方不传 action 时行为保持不变。 */
  action: feedbackActionEnum.default('DISLIKE'),
})

/** 标记与撤销统一返回 ok；撤销是幂等的，记录不存在也算成功。 */
export const feedbackOkSchema = z.object({
  ok: z.literal(true),
})

/** 一条反馈：菜品数据用于列表展示，createdAt 用于说明 7 天窗口从何时起算。 */
export const feedbackItemSchema = z.object({
  dish: dishSchema,
  createdAt: z.string(),
})

export const feedbackListResultSchema = z.object({
  items: z.array(feedbackItemSchema),
})

export type FeedbackBody = z.infer<typeof feedbackBodySchema>
export type FeedbackOk = z.infer<typeof feedbackOkSchema>
export type FeedbackItem = z.infer<typeof feedbackItemSchema>
export type FeedbackListResult = z.infer<typeof feedbackListResultSchema>
