// 需登录态的接口集成用例（AUTH-12 / HISTORY-04 / TRACK-02）。
// 用 demo@chishafan.local / user1234 走完整登录 → 操作 → 校验链路。
// 依赖：数据库已 migrate + seed（CI 由 workflow 准备）。

import { describe, expect, it } from 'vitest'
import { setup, fetch } from '@nuxt/test-utils/e2e'

const DEMO = { login: 'demo@chishafan.local', password: 'user1234' }

/**
 * 登录并返回可直接放进 Cookie 头的字符串。
 * 用 fetch（而非 $fetch）是为了拿 Response.headers 里的 Set-Cookie。
 */
async function loginAndGetCookie(credentials = DEMO): Promise<string> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  })
  if (!res.ok) throw new Error(`登录失败: ${res.status}`)
  // getSetCookie() 返回 Set-Cookie 数组，拼成 Cookie 头格式。
  return res.headers.getSetCookie().join('; ')
}

/** 带 cookie 的 JSON 请求。 */
async function authedFetch(
  path: string,
  cookie: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      ...(init.headers ?? {}),
    },
  })
}

describe('需登录态的接口', async () => {
  // serverStartTimeout 放宽到 5 分钟：本机首次构建约 100s，默认 120s 容易超时。
  await setup({ dev: true, server: true, serverStartTimeout: 300_000 })

  // ── 后台页 SSR：必须转发会话 Cookie，否则整页 500 ───────────────
  it('管理员直接请求 /admin 页面 SSR 返回 200 并渲染看板', async () => {
    const adminCookie = await loginAndGetCookie({
      login: 'admin@chishafan.local',
      password: 'admin1234',
    })
    // 回归点：apiFetch 在 SSR 阶段若不用 useRequestFetch 转发 Cookie，
    // /api/admin/stats 会 401，紧接着 ElMessage 在服务端访问 document 抛错 → 500。
    const res = await authedFetch('/admin', adminCookie)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('数据看板')
  })

  // ── AUTH-12：改密后旧会话立即失效 ──────────────────────────────
  it('修改密码后旧会话 cookie 再请求受保护接口返回 401', async () => {
    const cookie = await loginAndGetCookie()
    // 先确认会话有效。
    const me = await authedFetch('/api/favorites', cookie)
    expect(me.status).toBe(200)

    // 改密：当前密码 + 新密码。
    const changeRes = await authedFetch('/api/me/password', cookie, {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword: 'user1234', newPassword: 'user1234' }),
    })
    expect([200, 400]).toContain(changeRes.status)

    // 旧会话再请求：sessionVersion 已自增，应 401。
    const after = await authedFetch('/api/favorites', cookie)
    expect(after.status).toBe(401)
  })

  // ── HISTORY-04：就餐记录撤销 ───────────────────────────────────
  it('POST 就餐记录后 DELETE 撤销，重复删除返回 404', async () => {
    const cookie = await loginAndGetCookie()

    // 取一道在架菜品 id。
    const dishesRes = await fetch('/api/dishes', { query: { page: 1, pageSize: 1 } } as never)
    const dishes = (await dishesRes.json()) as { items: Array<{ id: string }> }
    const dishId = dishes.items[0]!.id

    // 写入就餐记录。
    const createRes = await authedFetch('/api/history', cookie, {
      method: 'POST',
      body: JSON.stringify({ dishIds: [dishId] }),
    })
    expect(createRes.status).toBe(200)
    const createBody = (await createRes.json()) as { recorded: number }
    expect(createBody.recorded).toBeGreaterThanOrEqual(0)

    // 从历史列表取刚写入的记录 id。
    const listRes = await authedFetch('/api/history?page=1&pageSize=1', cookie)
    const list = (await listRes.json()) as { items: Array<{ id: string; dish: { id: string } }> }
    const record = list.items.find((i) => i.dish.id === dishId)
    expect(record).toBeDefined()

    // 撤销：今天的记录在 7 天窗口内，应成功。
    const delRes = await authedFetch(`/api/history/${record!.id}`, cookie, { method: 'DELETE' })
    expect(delRes.status).toBe(200)
    const delBody = (await delRes.json()) as { deleted: boolean }
    expect(delBody.deleted).toBe(true)

    // 重复删除同一条 → 404（记录不存在）。
    const delAgain = await authedFetch(`/api/history/${record!.id}`, cookie, { method: 'DELETE' })
    expect(delAgain.status).toBe(404)
  })

  it('撤销别人的或不存在的记录统一返回 404，不暴露存在性', async () => {
    const cookie = await loginAndGetCookie()
    // 不存在的 id 直接 404，不能用 403 暴露「这条 id 存在但不是你的」。
    const res = await authedFetch('/api/history/000000000000000000000000', cookie, {
      method: 'DELETE',
    })
    expect(res.status).toBe(404)
  })

  // ── TRACK-02：埋点 eventId 去重 ─────────────────────────────────
  it('重复 eventId 上报只计一次（skipDuplicates）', async () => {
    const cookie = await loginAndGetCookie()

    // 取一道真实菜品 id，避免被 validDishIds 过滤掉。
    const dishesRes = await fetch('/api/dishes', { query: { page: 1, pageSize: 1 } } as never)
    const dishes = (await dishesRes.json()) as { items: Array<{ id: string }> }
    const dishId = dishes.items[0]!.id
    const eventId = `e2e-${Date.now()}`

    // 同一 eventId 上报两次，accepted 应只有 1。
    const payload = { events: [{ eventId, type: 'IMPRESSION', source: 'RANDOM', dishId }] }
    const first = await authedFetch('/api/tracking/recommend-events', cookie, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    expect(first.status).toBe(200)
    expect((await first.json()).accepted).toBe(1)

    const second = await authedFetch('/api/tracking/recommend-events', cookie, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    expect(second.status).toBe(200)
    // 重复 eventId 被唯一键 skipDuplicates 跳过，不再新增。
    expect((await second.json()).accepted).toBe(0)
  })

  it('游客也可以上报埋点，且不存在的 dishId 被静默丢弃', async () => {
    // 不带 cookie = 游客。
    const res = await fetch('/api/tracking/recommend-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          { eventId: `guest-${Date.now()}`, type: 'CLICK', source: 'AI', dishId: 'not-exist-id' },
        ],
      }),
    })
    expect(res.status).toBe(200)
    // dishId 不存在被过滤，accepted = 0，但接口不报错（TRACK-04）。
    expect((await res.json()).accepted).toBe(0)
  })
})
