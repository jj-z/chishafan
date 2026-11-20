<script setup lang="ts">
import type { HistoryItem } from '#shared/schemas/history'
import {
  historyDeleteOkSchema,
  historyListResultSchema,
  historyQuerySchema,
} from '#shared/schemas/history'
import { MEAL_LABELS } from '#shared/utils/dish'

// 就餐历史页：展示「哪天吃了哪道菜」（HIST-01）。
// 这是从「我的」进入的二级页，不属于四个主 tab，因此不开启 KeepAlive，
// 每次进来都重新拉取，保证刚点过「就吃它」立刻能看到。

const { session } = useAuth()

usePageSeo({ title: '就餐历史', description: '按天记录吃过什么，最近 7 天的误操作可以直接撤销。' })
const { categoryName, loadCategories } = useCategories()
const router = useRouter()

const items = ref<HistoryItem[]>([])
const total = ref(0)
/** 下一次要请求的页码。首屏从 1 开始，每加载完一页自增。 */
const page = ref(1)
const pageSize = 10
/** van-list 的加载中状态，由 fetchPage 负责开关。 */
const loading = ref(false)
/** 下拉刷新状态（van-pull-refresh 的 v-model）。 */
const refreshing = ref(false)
/** 没有更多记录了，van-list 会据此停止触发 load。 */
const finished = ref(false)
const loaded = ref(false)

/**
 * 请求序号：下拉刷新与上拉加载可能交错，只让最后一次发出的请求写回列表，
 * 避免旧的追加结果拼到刚刷新完的新列表后面。
 */
let requestSeq = 0

/** 取本地日历的今天（YYYY-MM-DD），用来给今天的记录打个「今天」标记。 */
function localToday(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

const today = localToday()

/**
 * 把扁平记录按 eatenOn 分组：接口已按日期倒序返回，
 * 这里只做「相邻同日期合并」，不需要再排序，逻辑简单且不易出错。
 */
const groups = computed(() => {
  const result: { date: string; items: HistoryItem[] }[] = []
  for (const item of items.value) {
    const last = result[result.length - 1]
    if (last && last.date === item.eatenOn) last.items.push(item)
    else result.push({ date: item.eatenOn, items: [item] })
  }
  return result
})

/**
 * 加载下一页。van-list 在「首次挂载内容不足一屏」和「滚动到底部」时都会调用它，
 * 首屏请求也由它驱动；关掉 van-list 的初次检测再手动请求会让后续滚动触发失效。
 * 游客没有历史接口权限，直接结束加载，避免一直转圈。
 */
async function onLoad() {
  if (!session.loggedIn.value) {
    loading.value = false
    finished.value = true
    return
  }

  const seq = ++requestSeq
  // 发请求前先用共享 schema 校验分页参数（与服务端同一份规则）：
  // 页码被改成 0 / 负数 / 超出 pageSize 上限时，本地就能拦下来，
  // 不必等服务端返回 400。
  const query = historyQuerySchema.safeParse({ page: page.value, pageSize })
  if (!query.success) {
    showToast(query.error.issues[0]?.message ?? '分页参数不合法')
    loading.value = false
    return
  }

  loading.value = true
  try {
    const data = await apiFetch('/api/history', historyListResultSchema, {
      // 用校验后的结果作为请求参数，保证发出去的一定是合法整数（schema 已做 coerce）
      query: query.data,
    })
    if (seq !== requestSeq) return
    // 接口按日期倒序返回，追加后相邻同日期仍能被 groups 正确合并
    items.value = [...items.value, ...data.items]
    total.value = data.total
    finished.value = items.value.length >= data.total
    page.value += 1
    loaded.value = true
  } catch (err: unknown) {
    showToast((err as Error).message || '加载失败')
  } finally {
    if (seq === requestSeq) {
      loading.value = false
      refreshing.value = false
    }
  }
}

/** 重置列表并重新加载，用于下拉刷新。 */
function reload() {
  items.value = []
  page.value = 1
  finished.value = false
  loading.value = true
  return onLoad()
}

/** 下拉刷新：从第一页重来，保证刚点过「就吃它」的记录立刻出现。 */
function onRefresh() {
  return reload()
}

// 分类只加载一次；首屏记录交给 van-list 的初次检测触发 onLoad
onMounted(() => {
  loadCategories()
})

function goLogin() {
  router.push({ path: '/login', query: { redirect: '/history' } })
}

function openDish(id: string) {
  router.push(`/dishes/${id}`)
}

/**
 * 撤销一条就餐记录（HISTORY-04）。
 * 先弹确认框：历史会影响推荐去重与统计，误触左滑不能被静默删除。
 */
async function removeItem(item: HistoryItem) {
  try {
    await showConfirmDialog({
      title: '撤销记录',
      message: `确定撤销「${item.dish.name}」这条记录吗？撤销后这道菜会重新出现在推荐里。`,
      confirmButtonText: '撤销',
      cancelButtonText: '再想想',
    })
  } catch {
    // Vant 的确认框在用户点取消时 reject，这里直接返回，不当作错误提示。
    return
  }

  try {
    await apiFetch(`/api/history/${item.id}`, historyDeleteOkSchema, { method: 'DELETE' })
    // 本地同步删除，避免整页重拉导致列表跳动；total 同步递减以保持「共 N 条」一致。
    items.value = items.value.filter((row) => row.id !== item.id)
    total.value = Math.max(0, total.value - 1)
    showToast('已撤销')

    // 如果删空当前页但后面还有数据，继续加载一页，避免出现「共 N 条但列表为空」。
    if (!items.value.length && total.value > 0) {
      finished.value = false
      void onLoad()
    }
  } catch (err: unknown) {
    showToast((err as Error).message || '撤销失败，请稍后再试')
  }
}
</script>

<template>
  <div class="history">
    <van-nav-bar title="就餐记录" left-text="返回" left-arrow @click-left="router.back()" />

    <div class="history__body">
      <van-pull-refresh v-model="refreshing" @refresh="onRefresh">
        <van-list
          v-model:loading="loading"
          :finished="finished"
          :finished-text="items.length ? '没有更多了' : ''"
          @load="onLoad"
        >
          <p v-if="loaded && items.length" class="history__total">
            共 {{ total }} 条记录，左滑可撤销最近 7 天内的误操作
          </p>

          <div v-if="groups.length" class="history__groups">
            <section v-for="group in groups" :key="group.date" class="history__group">
              <!-- 日期不再是普通文字，改成小号棕色标签，和菜品名形成两级视觉层次 -->
              <div class="history__date">
                <span class="app-chip">{{ group.date }}</span>
                <span v-if="group.date === today" class="app-chip app-chip--info">今天</span>
              </div>

              <!-- 一天一张奶油卡片，卡片内用 1px 分割线连接各行，避免每行一张卡片的碎片感 -->
              <div class="app-card history__card">
                <van-swipe-cell v-for="item in group.items" :key="item.id" class="history__swipe">
                  <div class="history__item" @click="openDish(item.dish.id)">
                    <div class="history__thumb">
                      <van-image
                        v-if="item.dish.imageUrl"
                        :src="item.dish.imageUrl"
                        :alt="item.dish.name"
                        fit="cover"
                        width="100%"
                        height="100%"
                      >
                        <template #error>
                          <van-icon name="orders-o" size="20" />
                        </template>
                      </van-image>
                      <van-icon v-else name="orders-o" size="20" />
                    </div>
                    <div class="history__info">
                      <p class="history__name">{{ item.dish.name }}</p>
                      <p class="history__meta">
                        {{ categoryName(item.dish.categoryId) }} ·
                        {{ MEAL_LABELS[item.dish.mealType] }}
                      </p>
                    </div>
                    <van-icon name="arrow" class="history__arrow" />
                  </div>

                  <!-- 左滑露出撤销按钮；仅本人最近 7 天可撤销（HISTORY-04） -->
                  <template #right>
                    <van-button
                      square
                      type="danger"
                      class="history__revoke"
                      text="撤销"
                      @click="removeItem(item)"
                    />
                  </template>
                </van-swipe-cell>
              </div>
            </section>
          </div>

          <div v-else-if="session.loggedIn.value && loaded" class="history__empty">
            <van-empty description="还没有就餐记录，去首页点一次「就吃它」吧" />
          </div>
        </van-list>
      </van-pull-refresh>

      <div v-if="!session.loggedIn.value" class="history__guest">
        <van-empty description="登录后查看你的就餐记录" />
        <van-button block class="app-btn app-btn--solid" @click="goLogin">去登录</van-button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.history {
  // 页面背景由 .app-shell 统一铺纸纹，这里只负责内容留白
  &__body {
    padding: 14px 16px 24px;
  }

  &__groups {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  &__date {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 4px 8px;
  }

  // 卡片裁掉溢出内容，否则滑出的撤销按钮会顶破圆角
  &__card {
    overflow: hidden;
  }

  &__swipe {
    // 撤销按钮需要撑满整行高度，否则 swipe-cell 右侧会留白
    :deep(.van-swipe-cell__right) {
      display: flex;
    }

    // 用相邻兄弟画分割线，最后一行不会多出一条悬空的线
    & + & {
      border-top: 1px solid var(--app-color-line);
    }
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    cursor: pointer;
  }

  &__thumb {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    overflow: hidden;
    color: var(--app-color-text-muted);
    background: var(--app-color-media);
    border: 1px solid var(--app-color-line);
    border-radius: var(--app-radius-sm);
  }

  &__info {
    flex: 1;
    min-width: 0;
  }

  &__name {
    margin: 0;
    overflow: hidden;
    font-size: 16px;
    font-weight: 600;
    color: var(--app-color-text);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__meta {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--app-color-text-secondary);
  }

  &__arrow {
    color: var(--app-color-text-muted);
  }

  &__revoke {
    height: 100%;
    font-weight: 600;
    background: var(--app-color-danger);
    border: none;
  }

  // 记录总数挪到列表顶部：分页器拆掉后放在底部会被「没有更多了」压在下面
  &__total {
    margin: 0 4px 14px;
    font-size: 12px;
    text-align: center;
    color: var(--app-color-text-secondary);
  }

  &__empty,
  &__guest {
    margin-top: 32px;
  }
}
</style>
