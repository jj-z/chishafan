// robots.txt（P2-22）：允许抓取公开的选餐页面，禁止抓取后台与用户私有数据。
// 用服务端路由生成而不是 public/robots.txt：sitemap 地址需要跟随部署域名，写死会指向 localhost。

import type { H3Event } from 'h3'

export default defineEventHandler((event: H3Event) => {
  const origin = getRequestURL(event).origin

  setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8')
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api',
    'Disallow: /me',
    'Disallow: /history',
    'Disallow: /favorites',
    'Disallow: /preferences',
    'Disallow: /chat',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n')
})
