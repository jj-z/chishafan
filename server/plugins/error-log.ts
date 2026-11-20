// 统一错误日志插件（P2-19）。
// Nitro 捕获到未处理错误时会调用 error 钩子，这里把「错误 + requestId + 路径 + 状态码」
// 以单行 JSON 打到 stderr，交由平台日志（Docker / PM2 / 云日志）收集。
// 这相当于最小可用的错误上报：不引入 Sentry 依赖，但足以按 requestId 还原一次请求。
//
// 4xx 是预期内的客户端错误（未登录、参数不合法），不写 error 级别，避免污染告警；
// 只记录 5xx 与没有状态码的未知错误。

import type { H3Event } from 'h3'

export default defineNitroPlugin((nitroApp) => {
  // Nitro 的 error 钩子没有出现在公开的 NitroHooks 类型里，这里收窄成局部签名，
  // 避免用 any 污染整个插件（钩子参数见 nitropack/runtime/internal/app.mjs）。
  const hooks = nitroApp.hooks as unknown as {
    hook: (
      name: 'error',
      handler: (error: Error, context: { event?: H3Event }) => void | Promise<void>,
    ) => void
  }

  hooks.hook('error', (error, context) => {
    const event = context.event
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500
    if (statusCode < 500) return

    console.error(
      JSON.stringify({
        level: 'error',
        event: 'server.error',
        requestId: event?.context.requestId,
        method: event?.method,
        path: event?.path,
        status: statusCode,
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      }),
    )
  })
})
