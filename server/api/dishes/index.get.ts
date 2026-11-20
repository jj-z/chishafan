// 菜品列表接口：分类筛选 + 菜名搜索 + 分页，返回统一 { items, total, page, pageSize }。

import { dishListResultSchema, dishesQuerySchema } from '../../../shared/schemas/dish'
import { dishSelect, toDishDetail } from '../../utils/dish'

export default defineEventHandler(async (event) => {
  const query = validateQuery(event, dishesQuerySchema)

  const where = {
    deletedAt: null,
    isPublished: true,
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    // 菜名模糊匹配（DISH-03）。mode: 'insensitive' 让 PostgreSQL 走 ILIKE；
    // 中文没有大小写概念，所以不必为搜索额外引入分词或拼音库。
    ...(query.keyword ? { name: { contains: query.keyword, mode: 'insensitive' as const } } : {}),
  }

  // 列表 + 总数并行查询，避免两次串行往返数据库。
  const [rows, total] = await Promise.all([
    prisma.dish.findMany({
      where,
      select: dishSelect,
      orderBy: [{ createdAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.dish.count({ where }),
  ])

  // 零结果搜索留痕（SEARCH-04 / P2-12 看板）：只记「搜了没搜到」的关键词，
  // 正常搜索不写库。写失败不能影响用户搜索，因此不 await、只兜底吞掉异常。
  if (query.keyword && total === 0) {
    void prisma.searchLog
      .create({ data: { keyword: query.keyword, resultCount: 0 } })
      .catch((err: unknown) => {
        console.warn(
          JSON.stringify({
            level: 'warn',
            event: 'search.log',
            requestId: event.context.requestId,
            error: err instanceof Error ? err.message : String(err),
          }),
        )
      })
  }

  const payload = {
    items: rows.map(toDishDetail),
    total,
    page: query.page,
    pageSize: query.pageSize,
  }
  return assertResponse(dishListResultSchema, payload, '菜品列表')
})
