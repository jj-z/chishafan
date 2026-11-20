// 健康检查响应契约（P2-19）。
// 只暴露最小信息：调用方（负载均衡 / 监控）只需要判断「服务可用 + 数据库是否连通」，
// 禁止返回数据库地址、版本号等可能被利用的细节。

import { z } from 'zod'

export const healthSchema = z.object({
  status: z.enum(['ok', 'error']),
  database: z.enum(['up', 'down']),
  /** 进程已运行秒数，用于观察是否发生过重启。 */
  uptimeSeconds: z.number().min(0),
  /** 本次数据库探活耗时，超过阈值时监控可据此告警。 */
  latencyMs: z.number().int().min(0),
  timestamp: z.string(),
})

export type Health = z.infer<typeof healthSchema>
