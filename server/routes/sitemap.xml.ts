// sitemap.xml（P2-22）：让搜索引擎能发现首页、菜品库与在架菜品详情。
// 只收录公开可抓取的页面；后台、登录、个人中心不参与收录（见 robots.txt）。

export default defineEventHandler(async (event) => {
  const origin = getRequestURL(event).origin

  // 上限 2000 条：一期菜品量远小于此，加限制是为了防止菜库异常膨胀时把响应撑大。
  const dishes = await prisma.dish.findMany({
    where: { deletedAt: null, isPublished: true },
    select: { id: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 2000,
  })

  const staticPages = [
    { loc: `${origin}/`, lastmod: new Date().toISOString().slice(0, 10) },
    { loc: `${origin}/dishes`, lastmod: new Date().toISOString().slice(0, 10) },
  ]

  const urlEntries = [
    ...staticPages.map(
      (page) => `  <url><loc>${page.loc}</loc><lastmod>${page.lastmod}</lastmod></url>`,
    ),
    ...dishes.map(
      (dish) =>
        `  <url><loc>${origin}/dishes/${encodeURIComponent(dish.id)}</loc><lastmod>${dish.updatedAt
          .toISOString()
          .slice(0, 10)}</lastmod></url>`,
    ),
  ]

  setResponseHeader(event, 'content-type', 'application/xml; charset=utf-8')
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urlEntries,
    '</urlset>',
    '',
  ].join('\n')
})
