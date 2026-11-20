// 知识库同步与检索（D3）。
//
// 职责：
// 1. 把菜品转成知识片段（一份菜一个文档，长做法单独成片）；
// 2. 后台写菜品后重建该菜的向量；
// 3. 提供检索能力：优先 pgvector 余弦检索，embedding 不可用时降级为关键词匹配。
//
// 为什么向量读写都放在这里：Prisma 不支持 vector 类型，raw SQL 只能收敛在单一模块，
// 业务代码永远只看到 { found, hits } 这样的普通对象。

import { createHash, randomUUID } from 'node:crypto'
import { Prisma } from '../../shared/generated/prisma/client'
import { prisma } from './db'
import {
  ALLERGEN_LABELS,
  MEAL_LABELS,
  PRICE_LABELS,
  ROLE_LABELS,
  SERVING_LABELS,
  SPICY_LABELS,
} from '../../shared/utils/dish'
import type { Allergen } from '../../shared/types/dish'
import { embedQuery, embedTexts, isEmbeddingConfigured, toVectorLiteral } from './embedding'
import { keywordScore } from './knowledgeScore'

/** 检索返回的知识片段。dishId 用于后续回查真实菜品，content 直接拼 prompt。 */
export interface KnowledgeHit {
  dishId: string
  content: string
  score: number
}

export interface KnowledgeSearchResult {
  /** 是否有达到阈值的结果；false 时模型必须诚实说不知道。 */
  found: boolean
  hits: KnowledgeHit[]
  topScore: number
  /** true 表示走的是关键词降级，而不是向量检索（用于日志与前端提示）。 */
  degraded: boolean
}

/** 相似度阈值：低于它视为「知识库里没有」。可用环境变量校准。 */
function threshold(): number {
  const raw = process.env.NUXT_RAG_THRESHOLD
  const value = raw ? Number.parseFloat(raw) : Number.NaN
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : 0.35
}

/** 后台同步可能一次处理很多菜，单次检索的默认条数控制在 6，避免 prompt 被撑爆。 */
const DEFAULT_TOP_K = 6

interface DishRow {
  id: string
  name: string
  description: string | null
  mealType: keyof typeof MEAL_LABELS
  servingMode: keyof typeof SERVING_LABELS
  role: keyof typeof ROLE_LABELS
  spicyLevel: number
  priceLevel: number
  tags: string[]
  ingredients: string[]
  allergens: Allergen[]
  steps: string | null
  categoryName: string
}

/** 单次加载菜品全部可索引字段；已删除的菜返回 null。 */
async function loadDishRow(dishId: string): Promise<DishRow | null> {
  const row = await prisma.dish.findFirst({
    where: { id: dishId, deletedAt: null },
    select: {
      id: true,
      name: true,
      description: true,
      mealType: true,
      servingMode: true,
      role: true,
      spicyLevel: true,
      priceLevel: true,
      tags: true,
      ingredients: true,
      allergens: true,
      steps: true,
      category: { select: { name: true } },
    },
  })
  if (!row) return null
  return { ...row, categoryName: row.category.name }
}

/** 内容哈希：内容没变就不需要重新向量化。 */
function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

/** 做法是否单独切片：超过 300 字说明步骤足够长，混在简介里会稀释片段主题。 */
const STEPS_SPLIT_LENGTH = 300

/**
 * 把一道菜转成知识文档。
 * 只描述业务事实，不写内部 id：片段会原样进入 prompt，内部标识只会让模型念出乱码。
 */
export function buildDishDocuments(row: DishRow): string[] {
  const facts = [
    `菜名：${row.name}`,
    `菜系：${row.categoryName}`,
    `餐别：${MEAL_LABELS[row.mealType]}`,
    `形态：${SERVING_LABELS[row.servingMode]}`,
    row.servingMode === 'DISH' ? `在组合餐中的角色：${ROLE_LABELS[row.role]}` : '',
    `辣度：${SPICY_LABELS[row.spicyLevel] ?? '未知'}`,
    `价位：${PRICE_LABELS[row.priceLevel - 1] ?? '未知'}`,
    row.description ? `简介：${row.description}` : '',
    row.tags.length ? `标签：${row.tags.join('、')}` : '',
    row.ingredients.length ? `主要食材：${row.ingredients.join('、')}` : '',
    row.allergens.length
      ? `过敏原：${row.allergens.map((code) => ALLERGEN_LABELS[code] ?? code).join('、')}`
      : '过敏原：无已知过敏原',
  ].filter(Boolean)

  const steps = row.steps?.trim() ?? ''
  if (!steps) return [facts.join('\n')]

  if ([...steps].length <= STEPS_SPLIT_LENGTH) {
    return [`${facts.join('\n')}\n做法：${steps}`]
  }
  // 长做法单独成片：检索「怎么做」时命中的是步骤片，而不是整段简介。
  return [facts.join('\n'), `菜名：${row.name}\n做法步骤：${steps}`]
}

/**
 * 重建单道菜的知识片段与向量。
 * 片段先落库、再异步补向量：embedding 失败时关键词降级仍然可用，
 * 不能因为向量服务抖动就让知识库整体不可检索。
 */
export async function syncDishKnowledge(
  dishId: string,
): Promise<{ chunks: number; embedded: number }> {
  const row = await loadDishRow(dishId)
  if (!row) {
    await removeDishKnowledge(dishId)
    return { chunks: 0, embedded: 0 }
  }

  const records = buildDishDocuments(row).map((content) => ({
    id: randomUUID(),
    sourceType: 'DISH' as const,
    sourceId: dishId,
    content,
    contentHash: hashContent(content),
  }))

  // 删除旧片段再插入：避免内容修改后残留过期片段被检索到。
  await prisma.$transaction([
    prisma.knowledgeChunk.deleteMany({ where: { sourceType: 'DISH', sourceId: dishId } }),
    prisma.knowledgeChunk.createMany({ data: records }),
  ])

  if (!isEmbeddingConfigured()) return { chunks: records.length, embedded: 0 }

  try {
    const vectors = await embedTexts(records.map((record) => record.content))
    for (let i = 0; i < records.length; i++) {
      const vector = vectors[i]
      const record = records[i]
      if (!vector || !record) continue
      // 参数化后显式 cast：pg 驱动不认识 vector 类型，直接传数组会被当成 int[]。
      await prisma.$executeRaw(
        Prisma.sql`UPDATE "knowledge_chunks" SET "embedding" = ${toVectorLiteral(vector)}::vector, "updatedAt" = NOW() WHERE "id" = ${record.id}`,
      )
    }
    return { chunks: records.length, embedded: vectors.length }
  } catch (err) {
    // 只告警：片段已经落库，检索会走关键词降级，不影响后台操作本身。
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'knowledge.embed',
        dishId,
        error: err instanceof Error ? err.message : String(err),
      }),
    )
    return { chunks: records.length, embedded: 0 }
  }
}

/** 删除某道菜的全部知识片段（菜品软删除时调用）。 */
export async function removeDishKnowledge(dishId: string): Promise<void> {
  await prisma.knowledgeChunk.deleteMany({ where: { sourceType: 'DISH', sourceId: dishId } })
}

/**
 * 后台写入后触发的「尽力同步」。
 * 刻意不 await 在请求链路上阻塞后台操作：向量化是旁路能力，
 * 失败也必须只留日志，不能让管理员的新增/编辑因为 embedding 服务抖动而失败。
 */
export function scheduleKnowledgeSync(dishIds: string[]): void {
  const ids = [...new Set(dishIds.filter(Boolean))]
  if (!ids.length) return

  void (async () => {
    for (const id of ids) {
      try {
        await syncDishKnowledge(id)
      } catch (err) {
        console.warn(
          JSON.stringify({
            level: 'warn',
            event: 'knowledge.sync',
            dishId: id,
            error: err instanceof Error ? err.message : String(err),
          }),
        )
      }
    }
  })()
}

/** 记录未命中：用于后台发现知识库缺口与校准阈值。写日志失败不得影响问答。 */
function logMiss(query: string, topScore: number, userId: string | null): void {
  void prisma.ragMissLog
    .create({ data: { query: query.slice(0, 200), topScore, userId } })
    .catch(() => {
      // 旁路统计，失败静默。
    })
}

/** pgvector 余弦检索。返回按相似度倒序的原始结果（可能为空）。 */
async function vectorSearch(query: string, topK: number): Promise<KnowledgeHit[]> {
  const vector = toVectorLiteral(await embedQuery(query))
  const rows = await prisma.$queryRaw<Array<{ sourceId: string; content: string; score: number }>>(
    Prisma.sql`
      SELECT k."sourceId", k."content",
             1 - (k."embedding" <=> ${vector}::vector) AS "score"
      FROM "knowledge_chunks" k
      JOIN "dishes" d ON d."id" = k."sourceId"
      WHERE k."sourceType" = 'DISH'::"KnowledgeSourceType"
        AND k."embedding" IS NOT NULL
        AND d."deletedAt" IS NULL
        AND d."isPublished" = true
      ORDER BY k."embedding" <=> ${vector}::vector ASC
      LIMIT ${topK}
    `,
  )
  return rows.map((row) => ({
    dishId: row.sourceId,
    content: row.content,
    score: Number(row.score),
  }))
}

/**
 * 关键词降级检索：embedding 未配置或调用失败时使用。
 * 现查 dishes 而不是 knowledge_chunks，保证即使从未同步过向量也能工作。
 */
async function keywordSearch(query: string, topK: number): Promise<KnowledgeHit[]> {
  const rows = await prisma.dish.findMany({
    where: { deletedAt: null, isPublished: true },
    take: 500,
    select: {
      id: true,
      name: true,
      description: true,
      mealType: true,
      servingMode: true,
      role: true,
      spicyLevel: true,
      priceLevel: true,
      tags: true,
      ingredients: true,
      allergens: true,
      steps: true,
      category: { select: { name: true } },
    },
  })

  return rows
    .map((row) => {
      const base = { ...row, categoryName: row.category.name }
      const document = buildDishDocuments(base).join('\n')
      return { dishId: row.id, content: document, score: keywordScore(query, document) }
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

/**
 * 检索知识库。
 * 返回 found=false 时调用方必须让模型诚实拒答，禁止用「可能」「大概」编造。
 */
export async function searchKnowledge(
  query: string,
  options: { topK?: number; userId?: string | null } = {},
): Promise<KnowledgeSearchResult> {
  const topK = options.topK ?? DEFAULT_TOP_K
  const userId = options.userId ?? null
  const trimmed = query.trim()
  if (!trimmed) return { found: false, hits: [], topScore: 0, degraded: false }

  let degraded = false
  let hits: KnowledgeHit[] = []

  if (isEmbeddingConfigured()) {
    try {
      hits = await vectorSearch(trimmed, topK)
    } catch (err) {
      // 向量服务故障不能让问答整体挂掉：降级为关键词匹配（PREF-07 的 fail-open 思路）。
      degraded = true
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'knowledge.search',
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    }
  } else {
    degraded = true
  }

  if (degraded) hits = await keywordSearch(trimmed, topK)

  const min = threshold()
  // 关键词得分与余弦相似度不同量纲，降级时只要有重叠就视为命中。
  const accepted = degraded
    ? hits.filter((hit) => hit.score > 0)
    : hits.filter((hit) => hit.score >= min)

  const topScore = hits.length ? Math.max(...hits.map((hit) => hit.score)) : 0
  if (!accepted.length) {
    logMiss(trimmed, topScore, userId)
    return { found: false, hits: [], topScore, degraded }
  }

  return { found: true, hits: accepted, topScore, degraded }
}
