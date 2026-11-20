// 前后端共用的通用请求/响应契约。
// 为什么要用 Zod：接口参数和响应都是不可信的边界数据，先用 schema 约束成合法结构，
// 类型再通过 z.infer 从 schema 推导，前后端不会各写一份互相漂移的类型（见 docs/tech-stack.md）。

import { z } from 'zod'

/** 分页参数：page 从 1 开始；pageSize 上限 50，防止一次把全表拉回前端。 */
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
})

/** 列表接口统一响应结构：{ items, total, page, pageSize }，前端分页组件直接消费。 */
export const pageResultSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
  })

export type Page = z.infer<typeof pageSchema>
