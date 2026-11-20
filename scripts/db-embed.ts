// 知识库向量全量回填脚本（D1）。
//
// 用法：
//   npm run db:embed              # 重建所有未删除菜品的知识片段与向量
//   npm run db:embed -- --force   # 先清空 knowledge_chunks，再重建（清理已删除菜品的孤儿片段）
//   npm run db:embed -- --dry-run # 只统计待处理数量，不写库
//
// 为什么单独做成脚本而不是启动时自动跑：
// 1. 向量化会产生真实 API 费用，不能每次重启都全量重跑；
// 2. 迁移/部署阶段不需要联网，CI 没有 embedding Key 也能正常跑；
// 3. 运营改完数据后需要一个可重复执行的手动入口。

import 'dotenv/config'
import { prisma } from '../server/utils/db'
import { isEmbeddingConfigured } from '../server/utils/embedding'
import { syncDishKnowledge } from '../server/utils/knowledge'

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const force = args.has('--force')

async function main() {
  if (!isEmbeddingConfigured()) {
    console.warn(
      '[db:embed] 未配置 NUXT_EMBEDDING_API_KEY：片段会写入但 embedding 为空，检索将走关键词降级。',
    )
  }

  const dishes = await prisma.dish.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`[db:embed] 待处理 ${dishes.length} 道菜（force=${force}，dry-run=${dryRun}）`)
  if (dryRun) return

  if (force) {
    const removed = await prisma.knowledgeChunk.deleteMany({})
    console.log(`[db:embed] 已清空旧片段 ${removed.count} 条`)
  }

  let ok = 0
  let failed = 0
  for (const dish of dishes) {
    try {
      const result = await syncDishKnowledge(dish.id)
      ok += 1
      console.log(`  ✓ ${dish.name}：${result.chunks} 片，向量 ${result.embedded} 条`)
    } catch (err) {
      failed += 1
      console.error(`  ✗ ${dish.name}：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log(`[db:embed] 完成：成功 ${ok}，失败 ${failed}`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error('[db:embed] 执行失败：', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
