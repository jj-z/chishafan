// Token 每日配额（D6）。
//
// 与 rateLimit.consumeAiQuota 的分工：
// - consumeAiQuota：按「请求次数」防刷，内存实现，挡住脚本；
// - 本模块：按 token 控成本，数据库记账，重启不清零、多实例共用一份账。
//
// 为什么必须用 INSERT ... ON CONFLICT DO UPDATE：并发请求同时扣额度时，
// 「先读再写」会丢失更新，导致实际用量大于配额。

import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { Prisma } from '../../shared/generated/prisma/client'
import { prisma } from './db'
import type { TokenUsage } from './tokenEstimate'
import { quotaDay, toQuotaSnapshot, type TokenQuotaSnapshot } from './quotaMath'

/**
 * 配额主体 key：登录用户按账号（换 IP 绕不过），游客按 IP。
 * 与 rateLimit 的 key 口径保持一致，便于排查同一用户的两套额度。
 */
export function quotaSubject(event: H3Event, userId: string | null): string {
  if (userId) return `user:${userId}`
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  return `ip:${ip}`
}

/** 读取今日已用 token（不写库）。 */
export async function getTokenQuota(
  subjectKey: string,
  limit: number,
): Promise<TokenQuotaSnapshot> {
  const rows = await prisma.$queryRaw<Array<{ used: number }>>(Prisma.sql`
    SELECT ("promptTokens" + "completionTokens")::int AS "used"
    FROM "ai_usage_daily"
    WHERE "subjectKey" = ${subjectKey} AND "day" = ${quotaDay()}
  `)
  return toQuotaSnapshot(rows[0]?.used ?? 0, limit)
}

/**
 * 记一次请求（只加 requests 计数）。
 * 与 token 扣减分开：一次用户请求会触发多次模型调用，requests 只应记 1 次。
 */
export async function registerAiRequest(subjectKey: string): Promise<void> {
  const day = quotaDay()
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "ai_usage_daily" ("id", "subjectKey", "day", "promptTokens", "completionTokens", "requests", "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${subjectKey}, ${day}, 0, 0, 1, NOW(), NOW())
    ON CONFLICT ("subjectKey", "day") DO UPDATE
    SET "requests" = "ai_usage_daily"."requests" + 1,
        "updatedAt" = NOW()
  `)
}

/**
 * 原子累加 token 用量并返回最新快照。
 * 每次模型调用后都要调用（包括客户端已断开的场景），否则额度形同虚设。
 */
export async function chargeTokens(
  subjectKey: string,
  usage: TokenUsage,
  limit: number,
): Promise<TokenQuotaSnapshot> {
  const promptTokens = Math.max(0, Math.round(usage.promptTokens))
  const completionTokens = Math.max(0, Math.round(usage.completionTokens))

  const rows = await prisma.$queryRaw<Array<{ used: number }>>(Prisma.sql`
    INSERT INTO "ai_usage_daily" ("id", "subjectKey", "day", "promptTokens", "completionTokens", "requests", "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${subjectKey}, ${quotaDay()}, ${promptTokens}, ${completionTokens}, 0, NOW(), NOW())
    ON CONFLICT ("subjectKey", "day") DO UPDATE
    SET "promptTokens" = "ai_usage_daily"."promptTokens" + EXCLUDED."promptTokens",
        "completionTokens" = "ai_usage_daily"."completionTokens" + EXCLUDED."completionTokens",
        "updatedAt" = NOW()
    RETURNING ("promptTokens" + "completionTokens")::int AS "used"
  `)

  return toQuotaSnapshot(rows[0]?.used ?? promptTokens + completionTokens, limit)
}
