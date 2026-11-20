// AI 智能推荐的请求与 SSE 事件契约（P1，阶段四 20/21）。
//
// 为什么用 SSE 而不是普通 JSON：聊天回复需要「打字机」效果，模型每生成一小段
// 就立刻推给前端；普通 JSON 必须等全文生成完才能返回，体验差很多。
// 为什么用 POST + fetch 读流而不是 EventSource：浏览器原生 EventSource 只支持 GET、
// 不能带请求体，而用户的自然语言需求必须放在 body 里，所以前端用 fetch + ReadableStream 手动读流。
//
// 事件约定：每条事件都是一行 `data: {json}\n\n`，json 里的 type 字段区分事件类型，
// 前端按 type 分发，不需要解析 SSE 的 event: 行，少一层协议细节。

import { z } from 'zod'
import { ambientSchema, dishSchema } from './dish'

/** 用户输入的自然语言需求。限 200 字：聊天推荐不是长文写作，超长输入既慢又贵。 */
export const recommendRequestSchema = z.object({
  message: z.string().trim().min(1, '说点什么吧，比如「想吃点辣的」').max(200, '一次最多说 200 字'),
  /**
   * 最近几轮对话（一问一答算一轮，最多 6 轮 12 条），由前端随请求带回实现多轮聊天。
   * 内容限 300 字：assistant 的历史回复通常更短，user 超长会挤占候选清单的 prompt 空间。
   */
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(300),
      }),
    )
    .max(12)
    .optional(),
})

/** delta：模型增量输出的一个文本块，前端把它追加到当前气泡实现打字机效果。 */
export const recommendDeltaEventSchema = z.object({
  type: z.literal('delta'),
  text: z.string(),
})

/** 每日 token 额度快照：前端据此展示剩余额度与快用完的提醒。 */
export const aiQuotaSchema = z.object({
  used: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  remaining: z.number().int().nonnegative(),
})

/** tool：Agent 执行工具时的状态，前端用它展示「正在查天气…」。 */
export const recommendToolEventSchema = z.object({
  type: z.literal('tool'),
  name: z.string(),
  status: z.enum(['start', 'ok', 'fail']),
  message: z.string().optional(),
})

/** quota：每次模型调用后推送一次余额，剩余过低/耗尽时前端给用户提示。 */
export const recommendQuotaEventSchema = z.object({
  type: z.literal('quota'),
  ...aiQuotaSchema.shape,
})

/**
 * result：流结束后的最终事件。
 * - text：完整回复文本（已剥掉菜品标记），前端用它替换之前逐段拼接的内容；
 * - dishes：模型选中的真实菜品。由服务端回查数据库组装（REC-02），
 *   禁止直接采用模型输出的菜品字段，防止幻觉或被篡改；
 * - ambient / preferenceApplied：与随机推荐接口同一份环境上下文，用于气泡下方的提示；
 * - grounded / knowledgeMiss：本轮是否命中知识库；调用了检索但没命中时前端提示「未找到依据」；
 * - quota：本轮结束后的额度余额。
 */
export const recommendResultEventSchema = z.object({
  type: z.literal('result'),
  text: z.string(),
  dishes: z.array(dishSchema),
  ambient: ambientSchema,
  preferenceApplied: z.boolean(),
  grounded: z.boolean(),
  knowledgeMiss: z.boolean(),
  /** 这一餐的搭配说明，例如「主菜 + 配菜 + 汤，主食：米饭」；纯聊天回复没有。 */
  mealLabel: z.string().optional(),
  quota: aiQuotaSchema,
})

/** error：流式过程中任何失败（未配置 Key、上游超时、候选为空）都以本事件收尾，前端展示友好提示。 */
export const recommendErrorEventSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
})

/** 服务端到前端可能出现的全部事件。用 discriminatedUnion 让前端 switch(type) 获得精确类型。 */
export const recommendEventSchema = z.discriminatedUnion('type', [
  recommendDeltaEventSchema,
  recommendToolEventSchema,
  recommendQuotaEventSchema,
  recommendResultEventSchema,
  recommendErrorEventSchema,
])

export type RecommendRequest = z.infer<typeof recommendRequestSchema>
export type AiQuota = z.infer<typeof aiQuotaSchema>
export type RecommendDeltaEvent = z.infer<typeof recommendDeltaEventSchema>
export type RecommendToolEvent = z.infer<typeof recommendToolEventSchema>
export type RecommendQuotaEvent = z.infer<typeof recommendQuotaEventSchema>
export type RecommendResultEvent = z.infer<typeof recommendResultEventSchema>
export type RecommendErrorEvent = z.infer<typeof recommendErrorEventSchema>
export type RecommendEvent = z.infer<typeof recommendEventSchema>
