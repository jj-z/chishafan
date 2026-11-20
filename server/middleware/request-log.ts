// 请求日志中间件（P2-19）。
// 目标：线上任意一次请求都能用 requestId 串起来（日志 ↔ 前端反馈 ↔ 错误上报）。
// 只记录「谁在什么时候请求了什么、耗时多少、结果状态」，禁止记录 body，
// 否则登录密码、验证码、邮箱等敏感信息会进日志。
//
// 注意：这是单实例控制台日志，多实例部署时应替换为集中式日志（如 Loki / ELK）。

import { randomUUID } from 'node:crypto'

export default defineEventHandler((event) => {
  // 上游（网关 / 前端）带了 requestId 就复用，保证跨服务链路一致。
  const requestId = getRequestHeader(event, 'x-request-id') || randomUUID()
  event.context.requestId = requestId
  setResponseHeader(event, 'x-request-id', requestId)

  const startedAt = Date.now()

  // 用 Node 原生 res 的 finish 事件而不是 afterResponse 钩子：
  // 它能拿到最终状态码，且在连接正常结束时必定触发。
  event.node.res.on('finish', () => {
    const status = event.node.res.statusCode
    const line = {
      level: status >= 500 ? 'error' : 'info',
      requestId,
      method: event.method,
      path: event.path,
      status,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    }
    const text = JSON.stringify(line)
    if (status >= 500) console.error(text)
    else console.info(text)
  })
})
