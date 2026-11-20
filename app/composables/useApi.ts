// app/composables/useApi.ts
// 带 Zod 校验的 $fetch 封装。项目所有自定义接口的响应都必须过一遍 schema：
// 类型直接由 schema 推导，前后端不会各写一份漂移的类型；结构不符时提前抛错，
// 避免脏数据悄悄流进页面后在渲染阶段才暴露。

import type { z } from 'zod'

/**
 * 请求并校验响应。options 复用 $fetch 的参数（method / body / query 等）。
 * 校验失败抛出普通 Error，调用方用 showToast 展示即可。
 */
export async function apiFetch<T extends z.ZodTypeAny>(
  url: string,
  schema: T,
  options: Parameters<typeof $fetch>[1] = {},
): Promise<z.infer<T>> {
  // SSR 阶段必须用 useRequestFetch 转发浏览器带来的 Cookie：全局 $fetch 在服务端是
  // 一次「内部请求」，不带原始请求头，/api/admin/* 这类需登录接口会直接 401，
  // 导致后台页面在服务端渲染时整页失败。客户端仍走全局 $fetch。
  const fetcher = import.meta.server ? useRequestFetch() : $fetch
  const data = await fetcher(url, options)
  const result = schema.safeParse(data)
  if (!result.success) {
    // 这里只描述“响应结构不符”，不伪装成服务端 5xx：它只是前端自检。
    throw new Error(`接口响应不符合约定：${result.error.issues[0]?.message ?? '未知错误'}`)
  }
  return result.data
}
