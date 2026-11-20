// server/utils/validate.ts
// 统一的接口入参校验辅助。所有自定义 API 都必须用它校验 params/query/body，
// 不再在接口里手写 if 判断（那样字段一多就会漏校验，且错误信息不统一）。

import type { H3Event } from 'h3'
import type { z } from 'zod'

/**
 * 把 Zod 的校验错误转成 400 业务错误。
 * ZodError.issues 是数组，取第一条拼成「字段: 提示」，前端 showToast 能直接展示。
 * 用 400 而不是 422：与项目现有接口（注册/登录）保持一致的错误码约定。
 */
function toBadRequest(error: z.ZodError): never {
  const first = error.issues[0]
  const field = first?.path.join('.')
  const message = first ? (field ? `${field}: ${first.message}` : first.message) : '参数不合法'
  throw createError({ statusCode: 400, statusMessage: message })
}

/** 校验请求体。传入 schema，返回解析后的强类型数据。 */
export async function validateBody<T extends z.ZodTypeAny>(
  event: H3Event,
  schema: T,
): Promise<z.infer<T>> {
  const raw = await readBody(event)
  const result = schema.safeParse(raw)
  if (!result.success) toBadRequest(result.error)
  return result.data
}

/**
 * 校验查询参数。
 * getQuery 返回的数值/布尔都是字符串，schema 里用 z.coerce / z.preprocess 归一化；
 * excludeIds 这类参数在 URL 里可能是单值也可能是逗号串，schema 层统一解析成数组。
 */
export function validateQuery<T extends z.ZodTypeAny>(event: H3Event, schema: T): z.infer<T> {
  const raw = getQuery(event)
  const result = schema.safeParse(raw)
  if (!result.success) toBadRequest(result.error)
  return result.data
}

/** 校验动态路由参数（/api/dishes/:id 里的 id）。 */
export function validateParams<T extends z.ZodTypeAny>(event: H3Event, schema: T): z.infer<T> {
  const raw = getRouterParams(event)
  const result = schema.safeParse(raw)
  if (!result.success) toBadRequest(result.error)
  return result.data
}

/**
 * 校验响应体。开发期用来兜底「接口返回结构与约定不一致」——
 * 一旦不匹配直接抛错，避免把脏数据结构悄悄发给前端后难以排查。
 */
export function assertResponse<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
  label: string,
): z.infer<T> {
  const result = schema.safeParse(data)
  if (!result.success) {
    // 这是服务端自检错误，属于 500 而不是用户输入问题。
    throw createError({
      statusCode: 500,
      statusMessage: `${label} 响应结构不符合约定: ${result.error.issues[0]?.message ?? 'unknown'}`,
    })
  }
  return result.data
}
