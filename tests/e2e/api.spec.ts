// 关键接口集成用例（P2-16）。
// 启动真实 Nuxt 服务 + 数据库，验证「健康检查、菜品列表、游客鉴权边界、随机推荐」四条主链路。
// 依赖：数据库已 migrate 且执行过 `npm run db:seed`（CI 中由 workflow 准备）。

import { describe, expect, it } from 'vitest'
import { setup, $fetch, fetch } from '@nuxt/test-utils/e2e'

describe('核心接口集成', async () => {
  // dev 模式启动而非产物构建：Windows 下 Nitro 产物的 node_modules 软链在 teardown 时会
  // 报 EEXIST/ENOTEMPTY（用例本身能过但进程退出码非 0），dev 模式没有这一步。
  // serverStartTimeout 放宽到 5 分钟：本机首次构建约 100s，默认 120s 容易被首次请求拖超时。
  await setup({ dev: true, server: true, serverStartTimeout: 300_000 })

  it('GET /api/health 返回数据库可用', async () => {
    const res = await $fetch('/api/health')
    expect(res).toMatchObject({ status: 'ok', database: 'up' })
    expect(res.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('GET /api/dishes 返回分页菜品，且过滤未登录不可见字段', async () => {
    const res = await $fetch('/api/dishes', { query: { page: 1, pageSize: 2 } })
    expect(res.page).toBe(1)
    expect(res.pageSize).toBe(2)
    expect(res.items.length).toBeLessThanOrEqual(2)
    if (res.items.length) {
      expect(res.items[0]).not.toHaveProperty('isPublished')
      expect(res.items[0]).not.toHaveProperty('deletedAt')
      expect(res.items[0]).not.toHaveProperty('passwordHash')
    }
  })

  it('搜索不存在的菜名返回空列表而不是报错', async () => {
    const res = await $fetch('/api/dishes', {
      query: { keyword: '这道菜一定不存在-测试用', page: 1, pageSize: 10 },
    })
    expect(res.items).toEqual([])
    expect(res.total).toBe(0)
  })

  it('未登录访问收藏接口返回 401（AUTH-02）', async () => {
    const res = await fetch('/api/favorites')
    expect(res.status).toBe(401)
  })

  it('未登录撤销就餐记录返回 401（HISTORY-04）', async () => {
    const res = await fetch('/api/history/not-a-real-id', { method: 'DELETE' })
    expect(res.status).toBe(401)
  })

  it('游客可以抽一餐（随机推荐对游客开放）', async () => {
    const res = await $fetch('/api/dishes/random', {
      query: { historyDays: 0, includeRecent: true },
    })
    expect(res).toHaveProperty('meal')
    expect(res).toHaveProperty('degraded')
    expect(res).toHaveProperty('ambient')
    if (res.meal) {
      expect(['SINGLE', 'COMBO']).toContain(res.meal.kind)
      expect(res.meal.dishes.length).toBeGreaterThan(0)
    }
  })

  it('不存在的路由返回 404 品牌错误页', async () => {
    const res = await fetch('/definitely-not-exists', { headers: { accept: 'text/html' } })
    expect(res.status).toBe(404)
    const html = await res.text()
    expect(html).toContain('这页没找到')
  })
})
