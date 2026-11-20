// 旧库 → 新库数据搬迁脚本（本地一次性工具）。
//
// 背景：本机原来的 PostgreSQL（5432）没有 pgvector，无法执行 AI 知识库迁移；
// 新库是 docker compose 的 pgvector 容器（5434）。本脚本把旧库里已有的业务数据
// 按外键顺序复制到新库，避免重新造测试数据。
//
// 用法（PowerShell）：
//   $env:OLD_DATABASE_URL='postgresql://chishafan:chishafan123@localhost:5432/chishafan?schema=public'
//   npm run db:migrate-data                 # 只补缺失行（skipDuplicates）
//   npm run db:migrate-data -- --dry-run    # 只统计，不写库
//   npm run db:migrate-data -- --truncate   # 先清空新库业务表再全量复制（危险）
//
// 新库连接默认取 .env 的 DATABASE_URL，可用 NEW_DATABASE_URL 覆盖。

import 'dotenv/config'
import { PrismaClient } from '../shared/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { syncDishKnowledge } from '../server/utils/knowledge'

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const truncate = args.has('--truncate')
const skipKnowledge = args.has('--skip-knowledge')

const batchArg = [...args].find((arg) => arg.startsWith('--batch-size='))
const batchSize = (() => {
  const value = batchArg ? Number.parseInt(batchArg.split('=')[1] ?? '', 10) : Number.NaN
  return Number.isFinite(value) && value > 0 ? value : 500
})()

const OLD_URL = process.env.OLD_DATABASE_URL?.trim()
const NEW_URL = (process.env.NEW_DATABASE_URL ?? process.env.DATABASE_URL)?.trim()

/** 日志里只暴露主机/库名，绝不打印带密码的完整连接串。 */
function describeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`
  } catch {
    return '无法解析的连接串'
  }
}

/** Prisma 各 model 的 delegate 结构一致，但参数类型各不相同，统一收敛成这个最小接口。 */
interface TableDelegate {
  count: (args?: unknown) => Promise<number>
  findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>
  createMany: (args: {
    data: Array<Record<string, unknown>>
    skipDuplicates?: boolean
  }) => Promise<{ count: number }>
  deleteMany: (args?: unknown) => Promise<{ count: number }>
}

interface TableSpec {
  name: string
  /** 表名只用于日志与人工核对。 */
  label: string
  delegate: (client: PrismaClient) => TableDelegate
}

/**
 * 复制顺序必须满足外键依赖：被引用的表在前。
 * 新库独有的三张表（knowledge_chunks / ai_usage_daily / rag_miss_logs）不复制：
 * 前者由知识库同步重建，后两者是本地新增的运行数据。
 */
const TABLES: TableSpec[] = [
  { name: 'user', label: '用户', delegate: (c) => c.user as unknown as TableDelegate },
  { name: 'category', label: '分类', delegate: (c) => c.category as unknown as TableDelegate },
  { name: 'dish', label: '菜品', delegate: (c) => c.dish as unknown as TableDelegate },
  {
    name: 'userPreference',
    label: '口味偏好',
    delegate: (c) => c.userPreference as unknown as TableDelegate,
  },
  { name: 'favorite', label: '收藏', delegate: (c) => c.favorite as unknown as TableDelegate },
  {
    name: 'diningHistory',
    label: '就餐历史',
    delegate: (c) => c.diningHistory as unknown as TableDelegate,
  },
  {
    name: 'recommendEvent',
    label: '推荐埋点',
    delegate: (c) => c.recommendEvent as unknown as TableDelegate,
  },
  {
    name: 'dishFeedback',
    label: '菜品反馈',
    delegate: (c) => c.dishFeedback as unknown as TableDelegate,
  },
  {
    name: 'adminAuditLog',
    label: '后台审计',
    delegate: (c) => c.adminAuditLog as unknown as TableDelegate,
  },
  {
    name: 'searchLog',
    label: '搜索日志',
    delegate: (c) => c.searchLog as unknown as TableDelegate,
  },
  {
    name: 'aiCallLog',
    label: 'AI 调用日志',
    delegate: (c) => c.aiCallLog as unknown as TableDelegate,
  },
]

/** 清空只能按外键的逆序：先删引用方，再删被引用方。 */
const TRUNCATE_ORDER = [...TABLES].reverse()

function createClient(url: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
}

/**
 * 按 id 游标分页读取，避免一次性把大表读进内存。
 * 用 cursor 而不是 skip：skip 在深分页时是 O(n)，数据量上来会明显变慢。
 */
async function copyTable(
  source: TableDelegate,
  target: TableDelegate,
  label: string,
): Promise<{ total: number; copied: number }> {
  let cursor: string | undefined
  let total = 0
  let copied = 0

  while (true) {
    const rows = await source.findMany({
      take: batchSize,
      orderBy: { id: 'asc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    if (!rows.length) break

    total += rows.length
    if (!dryRun) {
      const result = await target.createMany({ data: rows, skipDuplicates: true })
      copied += result.count
    }

    const last = rows[rows.length - 1]
    cursor = typeof last?.id === 'string' ? last.id : undefined
    if (!cursor) break
    if (dryRun) copied += rows.length
  }

  const suffix = dryRun ? '（dry-run，未写入）' : ''
  console.log(`  ✓ ${label}: 读取 ${total}，写入 ${copied}${suffix}`)
  return { total, copied }
}

async function main() {
  if (!OLD_URL) {
    console.error(
      '缺少 OLD_DATABASE_URL。示例：\n' +
        "  $env:OLD_DATABASE_URL='postgresql://chishafan:chishafan123@localhost:5432/chishafan?schema=public'",
    )
    process.exitCode = 1
    return
  }
  if (!NEW_URL) {
    console.error('缺少新库连接串：请在 .env 配置 DATABASE_URL，或设置 NEW_DATABASE_URL。')
    process.exitCode = 1
    return
  }
  if (OLD_URL === NEW_URL) {
    console.error('新旧库连接串相同，已中止（避免自己复制自己）。')
    process.exitCode = 1
    return
  }

  console.log(`旧库：${describeUrl(OLD_URL)}`)
  console.log(`新库：${describeUrl(NEW_URL)}`)
  console.log(
    `批量：${batchSize} 条/批${dryRun ? '，dry-run 模式' : ''}${truncate ? '，将先清空新库业务表' : ''}`,
  )

  const oldClient = createClient(OLD_URL)
  const newClient = createClient(NEW_URL)

  try {
    // 写库前先确认新库已执行迁移，否则 createMany 会报 “表不存在”，错误很难指向根因。
    const migrated = await newClient.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'ai_usage_daily'
      ) AS "exists"
    `
    if (!migrated[0]?.exists) {
      console.error(
        '新库尚未执行迁移（ai_usage_daily 不存在）。请先运行 npx prisma migrate deploy。',
      )
      process.exitCode = 1
      return
    }

    if (truncate) {
      if (dryRun) {
        console.log('--truncate 与 --dry-run 同时出现：不会真正清空。')
      } else {
        console.log('\n清空新库业务表（外键逆序）...')
        // knowledge_chunks 用 sourceId 逻辑关联菜品、没有数据库外键，
        // 删完菜品后必须单独清空，否则会留下仍可被检索到的孤儿片段。
        const orphanChunks = await newClient.knowledgeChunk.deleteMany()
        console.log(`  - 知识片段: 删除 ${orphanChunks.count}`)
        for (const table of TRUNCATE_ORDER) {
          const result = await table.delegate(newClient).deleteMany()
          console.log(`  - ${table.label}: 删除 ${result.count}`)
        }
      }
    }

    console.log('\n开始复制...')
    let totalRows = 0
    for (const table of TABLES) {
      const result = await copyTable(
        table.delegate(oldClient),
        table.delegate(newClient),
        table.label,
      )
      totalRows += result.copied
    }
    console.log(`\n完成：共写入 ${totalRows} 行`)

    // 复制完菜品后重建知识片段：保证后续配置 embedding 时能直接 `db:embed` 补向量，
    // 而不是面对一张空的 knowledge_chunks。
    if (!skipKnowledge && !dryRun) {
      const dishes = await newClient.dish.findMany({
        where: { deletedAt: null },
        select: { id: true },
      })
      console.log(`\n重建知识片段（${dishes.length} 道菜）...`)
      for (const dish of dishes) {
        await syncDishKnowledge(dish.id)
      }
      console.log('  ✓ 知识片段已重建（未配置 embedding 时向量为空，检索走关键词降级）')
    }

    console.log('\n新库当前行数：')
    for (const table of TABLES) {
      const count = await table.delegate(newClient).count()
      console.log(`  - ${table.label}: ${count}`)
    }
  } finally {
    await oldClient.$disconnect()
    await newClient.$disconnect()
  }
}

main().catch((err) => {
  console.error('搬迁失败：', err)
  process.exitCode = 1
})
