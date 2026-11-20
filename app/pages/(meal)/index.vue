<script setup lang="ts">
import type { Meal, MealType, RandomResult } from '#shared/schemas/dish'
import { randomResultSchema } from '#shared/schemas/dish'
import { MEAL_LABELS } from '#shared/utils/dish'

// 首页：随机推荐「一餐」，真实接口 /api/dishes/random 实现 MEAL-01~08。
// KeepAlive：切到别的 tab 再回来不会重新抽签，保留刚才的结果（四个主 tab 之一）。

definePageMeta({ keepalive: true })

usePageSeo({
  title: '吃啥饭',
  description: '一键随机决定吃啥饭：可按早中晚三餐、菜系筛选，还能让 AI 帮你搭配一餐。',
})

const { loadCategories, categories } = useCategories()
const { isEatenToday, loadEatenToday, recordEaten } = useHistory()
// 去重窗口在「我的」页设置，这里只读取共享值参与抽签
const { historyDays } = useHistoryDays()
// 「不感兴趣」落库后 7 天内由服务端排除，本地同时补进 excludeIds，保证下一次抽签立即生效（PREF-11）
const { dislikeDish } = useFeedback()
// 推荐效果埋点：结果展示记 IMPRESSION、点开卡片由 DishCard 记 CLICK、「就吃它」记 DINE（TRACK-01）
const { trackImpressions, trackDine } = useRecommendTracking()
const router = useRouter()

const mealType = ref<'ALL' | MealType>('ALL')
const categoryId = ref<'ALL' | string>('ALL')
const result = ref<Meal | null>(null)
// 首次抽签发生在 onMounted，SSR 阶段还没有结果；用 ready 区分“未开始”和“筛选后为空”，
// 否则首屏会闪一下“没有可推荐的菜”。
const ready = ref(false)
const loading = ref(false)
// 去重记录：本次会话已展示过的菜品 id（DISH-04），刷新页面即清空。
const excludeIds = useState<string[]>('app-exclude-ids', () => [])
// 服务端按 IP 解析的城市/天气，以及本次是否应用了登录用户的口味偏好。
// 两者都来自随机接口响应，SSR 阶段为空，避免首页首屏等待外部天气服务。
const ambient = ref<RandomResult['ambient'] | null>(null)
const preferenceApplied = ref(false)

// 不感兴趣：组合餐有多道菜时必须让用户选具体哪道，否则会把整餐都标成不喜欢。
const showDislikeSheet = ref(false)
const disliking = ref(false)
const dislikeActions = computed(() =>
  (result.value?.dishes ?? []).map((d) => ({
    name: d.name,
    subname: '7 天内不再推荐这道菜',
    key: d.id,
  })),
)

const mealOptions = [
  { key: 'ALL' as const, label: '不限' },
  ...(Object.keys(MEAL_LABELS) as MealType[]).map((key) => ({ key, label: MEAL_LABELS[key] })),
]

// 分类选项由接口数据派生；「不限」固定在最前，与餐别筛选保持一致的交互
const categoryOptions = computed(() => [
  { key: 'ALL', label: '不限' },
  ...categories.value.map((c) => ({ key: c.id, label: c.name })),
])

async function draw() {
  if (loading.value) return
  loading.value = true
  try {
    const data = await apiFetch('/api/dishes/random', randomResultSchema, {
      query: {
        ...(mealType.value !== 'ALL' ? { mealType: mealType.value } : {}),
        ...(categoryId.value !== 'ALL' ? { categoryId: categoryId.value } : {}),
        ...(excludeIds.value.length ? { excludeIds: excludeIds.value.join(',') } : {}),
        historyDays: historyDays.value,
      },
    })
    // 服务端因候选池被筛空而降级时，清掉本地去重记录，避免下一次请求还是空转（DISH-04）
    if (data.degraded) excludeIds.value = []
    result.value = data.meal
    ambient.value = data.ambient
    preferenceApplied.value = data.preferenceApplied
    if (data.meal) {
      // 去重按菜品粒度：组合餐里出现的每一道菜都要记进 excludeIds（MEAL-07）
      excludeIds.value = Array.from(
        new Set([...excludeIds.value, ...data.meal.dishes.map((d) => d.id)]),
      )
      // 结果真正渲染给用户才算曝光；降级/空气泡不产生 IMPRESSION（TRACK-01）。
      trackImpressions(
        data.meal.dishes.map((d) => d.id),
        'RANDOM',
      )
    }
  } finally {
    loading.value = false
    ready.value = true
  }
}

// 首次进入页面加载分类 + 今天已吃 + 抽一餐；KeepAlive 下切 tab 回来不会重复触发
onMounted(() => {
  loadCategories()
  loadEatenToday()
  draw()
})

// 筛选变化后重新抽签
watch([mealType, categoryId, historyDays], () => {
  result.value = null
  ready.value = false
  draw()
})

const eatenToday = computed(() =>
  result.value ? result.value.dishes.every((d) => isEatenToday(d.id)) : false,
)

// 城市与天气合并成一行展示；任一为空就不显示，绝不让外部服务失败影响首页可用性。
const ambientText = computed(() => {
  const parts: string[] = []
  if (ambient.value?.city) parts.push(ambient.value.city)
  const weather = ambient.value?.weather
  if (weather) parts.push(`${weather.text} ${weather.tempC}℃`)
  return parts.join(' · ')
})

const emptyText = computed(() =>
  preferenceApplied.value
    ? '当前忌口与偏好下没有可推荐的，去「我的 → 口味偏好」调整试试'
    : '当前条件下没有可推荐的，换个筛选试试',
)

async function eatIt() {
  if (!result.value) return
  const dishIds = result.value.dishes.map((d) => d.id)
  const ok = await recordEaten(dishIds)
  if (ok) {
    // 只有就餐记录成功才埋 DINE，失败的上报会污染转化率（TRACK-01）。
    trackDine(dishIds, 'RANDOM')
    showToast('已记录，明天再换个新的')
  }
}

/**
 * 提交「不感兴趣」。
 * 成功后只从当前结果里移除这一道菜：组合餐保留主食与其它菜，避免整餐突然消失；
 * 单品餐移除后没有可展示的内容，重新抽一签。
 */
async function submitDislike(dishId: string) {
  if (!result.value || disliking.value) return
  disliking.value = true
  try {
    // 未登录时 dislikeDish 会跳登录页并返回 false，这里直接终止，不改动当前结果
    const ok = await dislikeDish(dishId)
    if (!ok) return

    const meal = result.value
    const rest = meal.dishes.filter((d) => d.id !== dishId)
    // 本地去重与服务端 7 天排除双保险：即使这次不重新抽签，下一次也不会再抽到它
    excludeIds.value = Array.from(new Set([...excludeIds.value, dishId]))
    showToast('已记录，7 天内不再推荐')

    if (rest.length) {
      result.value = { ...meal, dishes: rest }
    } else {
      result.value = null
      ready.value = false
      await draw()
    }
  } catch (err: unknown) {
    showToast((err as Error).message || '操作失败，请稍后再试')
  } finally {
    disliking.value = false
  }
}

/** 单品餐直接提交；组合餐先弹层让用户选择具体哪道菜。 */
function onDislikeClick() {
  if (!result.value) return
  if (result.value.dishes.length === 1) {
    const dish = result.value.dishes[0]
    if (dish) submitDislike(dish.id)
    return
  }
  showDislikeSheet.value = true
}

/** action-sheet 选中回调：key 是菜品 id，选中后关闭弹层由 close-on-click-action 负责。 */
function onDislikeSelect(action: { key: string }) {
  return submitDislike(action.key)
}
</script>

<template>
  <div class="home">
    <header class="home__header">
      <div class="home__header-top">
        <div class="home__header-text">
          <h1 class="home__title">吃啥饭</h1>
          <p class="home__subtitle">选不出就别想了，交给随机</p>
        </div>
        <!-- AI 入口是「换一种决策方式」的次要动作，放在标题右侧与品牌区同高，不再和结果操作按钮抢底部空间 -->
        <van-button class="app-btn app-btn--outline-primary home__ai" @click="router.push('/chat')">
          AI 帮我选
        </van-button>
      </div>
      <p v-if="ambientText || preferenceApplied" class="home__meta">
        <span v-if="ambientText">{{ ambientText }}</span>
        <span v-if="ambientText && preferenceApplied"> · </span>
        <span v-if="preferenceApplied">已按口味偏好推荐</span>
      </p>
    </header>

    <section class="home__filters">
      <FilterSheetSelect v-model="mealType" label="餐别" :options="mealOptions" />
      <FilterSheetSelect v-model="categoryId" label="分类" :options="categoryOptions" />
    </section>

    <section v-if="result" class="home__result">
      <MealCard :meal="result" track-source="RANDOM" />
      <p v-if="eatenToday" class="home__hint">这一餐今天已经吃过了</p>
    </section>

    <section v-else-if="!ready" class="home__empty">
      <van-loading type="spinner" color="var(--app-color-primary)">正在挑一餐…</van-loading>
    </section>

    <section v-else class="home__empty">
      <van-empty :description="emptyText" />
    </section>

    <footer class="home__actions">
      <van-button
        block
        class="app-btn app-btn--solid"
        :disabled="!result || loading"
        :loading="loading"
        @click="draw"
      >
        换一个
      </van-button>
      <van-button
        block
        class="app-btn app-btn--outline-danger"
        :disabled="!result || loading || disliking"
        :loading="disliking"
        @click="onDislikeClick"
      >
        不感兴趣
      </van-button>
      <van-button block class="app-btn app-btn--outline-success" :disabled="!result" @click="eatIt">
        就吃它
      </van-button>
    </footer>

    <!-- 组合餐有多道菜时，先选具体哪道不感兴趣；单品餐直接提交，不弹层 -->
    <van-action-sheet
      v-model:show="showDislikeSheet"
      :actions="dislikeActions"
      cancel-text="取消"
      close-on-click-action
      @select="onDislikeSelect"
    />
  </div>
</template>

<style lang="scss" scoped>
.home {
  padding: 16px 16px 24px;

  &__header {
    margin-bottom: 16px;
    padding-top: 8px;
  }

  // 标题区与 AI 入口同一行：AI 是次要入口，右对齐到标题右侧，避免再占一整行按钮高度
  &__header-top {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    justify-content: space-between;
  }

  &__header-text {
    min-width: 0;
  }

  // 覆写全局 .app-btn 的 46px 大按钮尺寸，收成标题旁的小胶囊
  &__ai {
    flex: none;
    height: 34px;
    padding: 0 14px;
    margin-top: 6px;
    font-size: 13px;
  }

  // 首页标题是产品名，用粗宋 + 大字号立住品牌，和其它页面的功能标题区分开
  &__title {
    margin: 0;
    font-family: var(--app-font-display);
    font-size: 34px;
    font-weight: 900;
    line-height: 1.15;
    letter-spacing: 0.02em;
    color: var(--app-color-text);
  }

  &__subtitle {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--app-color-text-secondary);
  }

  // 城市/天气/是否应用偏好，是一条「环境信息」，用标签形态和正文拉开层级
  &__meta {
    display: inline-flex;
    gap: 4px;
    align-items: center;
    margin: 10px 0 0;
    padding: 2px 10px;
    font-size: 12px;
    color: var(--app-color-primary-deep);
    background: rgb(228 104 31 / 9%);
    border: 1px solid rgb(228 104 31 / 30%);
    border-radius: 999px;
  }

  // 餐别与分类并排一行，省下一行高度给推荐结果；min-width: 0 允许窄屏下压缩子项
  &__filters {
    display: flex;
    gap: 8px;

    :deep(.filter-select) {
      flex: 1 1 0;
      min-width: 0;
    }
  }

  &__result {
    margin: 16px 0;
  }

  &__hint {
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--app-color-primary-deep);
  }

  &__empty {
    margin-top: 24px;
  }

  // 三个操作并排一行：都是对当前结果的即时动作，同一行更省底部空间、也便于一眼扫完
  // （AI 入口已上移到标题右侧，不再占这里的位置）
  &__actions {
    display: flex;
    flex-direction: row;
    gap: 8px;
    margin-top: 16px;

    // block 按钮默认 width: 100%，用 flex-basis 0 + width auto 均分三列，避免窄屏溢出
    :deep(.van-button) {
      flex: 1 1 0;
      width: auto;
      min-width: 0;
      font-size: 14px;
    }
  }
}
</style>
