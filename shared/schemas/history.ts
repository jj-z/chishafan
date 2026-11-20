// 就餐历史相关的请求/响应契约，与 docs/domain.md HIST-01~03 对齐。

import { z } from 'zod'
import { pageResultSchema } from './common'
import { dishSchema } from './dish'

/**
 * 「就吃它」请求体：一餐的每道菜独立成一条记录（HIST-03），
 * 组合餐最多 3 道菜（MEAL-04），最少 1 道。
 */
export const historyBodySchema = z.object({
  dishIds: z.array(z.string().min(1)).min(1).max(3),
})

/** 实际新写入的条数（同一天同一道菜已存在的不重复写，HIST-02）。 */
export const historyOkSchema = z.object({
  recorded: z.number().int().min(0),
})

/** 今天已吃的菜品 id，供首页/详情把按钮置灰。 */
export const historyTodaySchema = z.object({
  dishIds: z.array(z.string()),
})

/** 历史列表查询：服务端分页，与收藏列表保持同一套参数约定。 */
export const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
})

/**
 * 只表示日期的字符串（YYYY-MM-DD）。
 * 为什么必须严格校验格式：历史页按 eatenOn 分组展示，如果服务端返回的是带时间的
 * ISO 串（2026-11-10T00:00:00.000Z），同一天的记录会被拆成互不相等的多个分组。
 */
export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD')

/**
 * 一条历史记录。eatenOn 固定是 YYYY-MM-DD 字符串而不是时间戳：
 * 业务上只关心“哪天吃的”（HIST-01），传字符串可以避免前后端时区换算把日期算偏一天。
 */
export const historyItemSchema = z.object({
  id: z.string(),
  eatenOn: dateOnlySchema,
  dish: dishSchema,
})

export const historyListResultSchema = pageResultSchema(historyItemSchema)

/** 撤销单条历史时的路径参数（HISTORY-04）。 */
export const historyParamsSchema = z.object({
  id: z.string().min(1),
})

/**
 * 撤销结果。deleted=true 表示记录已删除；
 * 为了让前端能区分「删掉了」和「本来就没有」，不存在时接口返回 404 而不是成功。
 */
export const historyDeleteOkSchema = z.object({
  deleted: z.boolean(),
})

export type HistoryBody = z.infer<typeof historyBodySchema>
export type HistoryOk = z.infer<typeof historyOkSchema>
export type HistoryToday = z.infer<typeof historyTodaySchema>
export type HistoryQuery = z.infer<typeof historyQuerySchema>
export type HistoryItem = z.infer<typeof historyItemSchema>
export type HistoryListResult = z.infer<typeof historyListResultSchema>
export type HistoryParams = z.infer<typeof historyParamsSchema>
export type HistoryDeleteOk = z.infer<typeof historyDeleteOkSchema>
