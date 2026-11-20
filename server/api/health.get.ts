// GET /api/health（P2-19）。
// 负载均衡与监控依赖这个接口判断实例是否可用，因此：
// 1. 必须真实探活数据库（SELECT 1），不能只返回 200 假装健康；
// 2. 数据库不可用时返回 503，让上游把流量摘走；
// 3. 探活要带超时，避免数据库连接 hang 住时健康检查自身也被拖死。

import { healthSchema } from '../../shared/schemas/health'
import { prisma } from '../utils/db'
import { assertResponse } from '../utils/validate'

/** 探活超时上限：健康检查是高频调用，3 秒还没结果就按不可用处理。 */
const DB_PROBE_TIMEOUT_MS = 3000

/**
 * 给数据库探活加超时。
 * Prisma 的查询不方便直接取消，这里用 Promise.race 保证健康检查按时返回；
 * 超时后原查询会在后台自然结束，不会累积（每次都是独立短查询）。
 */
function withTimeout<T>(task: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`数据库探活超时（>${ms}ms）`)), ms)
  })
  // 无论成功还是超时都清掉定时器，避免进程里残留无意义的计时器。
  return Promise.race([task, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()

  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, DB_PROBE_TIMEOUT_MS)
    const latencyMs = Date.now() - startedAt
    return assertResponse(
      healthSchema,
      {
        status: 'ok',
        database: 'up',
        uptimeSeconds: Math.round(process.uptime()),
        latencyMs,
        timestamp: new Date().toISOString(),
      },
      '健康检查',
    )
  } catch (error) {
    const latencyMs = Date.now() - startedAt
    // 503 而不是 500：这是「依赖不可用」，上游应当重试或摘流量，而不是当成代码 bug。
    setResponseStatus(event, 503)
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'health check failed',
        requestId: event.context.requestId,
        durationMs: latencyMs,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    return assertResponse(
      healthSchema,
      {
        status: 'error',
        database: 'down',
        uptimeSeconds: Math.round(process.uptime()),
        latencyMs,
        timestamp: new Date().toISOString(),
      },
      '健康检查',
    )
  }
})
