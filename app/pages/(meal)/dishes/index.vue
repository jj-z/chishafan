<script setup lang="ts">
import type { DishDetail } from '#shared/schemas/dish'
import { dishListResultSchema, popularDishesResultSchema } from '#shared/schemas/dish'

// 菜品列表：分类筛选 + 菜名搜索 + 上拉加载更多 + 下拉刷新（DISH-01/DISH-03）。
// 用 van-list 做无缝滚动而不是分页器：分页器会把列表从中间切断，
// 手机上还得精确点页码，连续上拉更符合浏览菜品的心智。
// KeepAlive：切 tab 保留筛选、搜索词和已加载的列表，回来不重新请求。

definePageMeta({ keepalive: true })

usePageSeo({
  title: '菜品库',
  description: '浏览全部菜品，按菜系、餐别筛选，也可以直接搜索菜名。',
})

const { loadCategories, categories } = useCategories()
// 最近搜索词：本机 localStorage，最多 10 条（P2-10）
const { history, loadSearchHistory, rememberSearch, clearSearchHistory } = useSearchHistory()

const activeCategory = ref('ALL')
const keyword = ref('')
const pageSize = 6

// 分类选项由接口数据派生；「全部」固定在最前
const categoryOptions = computed(() => [
  { key: 'ALL', label: '全部' },
  ...categories.value.map((c) => ({ key: c.id, label: c.name })),
])

const list = ref<DishDetail[]>([])
const total = ref(0)
/** 下一次要请求的页码。首屏从 1 开始，每加载完一页自增。 */
const page = ref(1)
/** van-list 的加载中状态（v-model:loading），由 fetchPage 负责开关。 */
const loading = ref(false)
/** 下拉刷新中的状态，对应 van-pull-refresh。 */
const refreshing = ref(false)
/** 没有更多数据了，van-list 会据此停止触发 load 并展示 finished-text。 */
const finished = ref(false)
// 已加载过标记：用于区分「首次未开始」与「筛完为空」，避免首屏闪一下空态
const loaded = ref(false)

// 空结果兜底（P2-10）：热门菜 + 相近分类，保证用户不会停在死胡同
const popular = ref<DishDetail[]>([])
const popularLoaded = ref(false)
const popularLoading = ref(false)

/**
 * 请求序号：快速切分类或连续搜索时会连续触发多次请求，返回顺序无法保证。
 * 只让“最后一次发出的请求”写回列表，避免先发的旧结果覆盖新结果。
 */
let requestSeq = 0

/**
 * 加载下一页。van-list 在「首次挂载内容不足一屏」和「滚动到底部」时都会调用它，
 * 所以这里只做追加，首次请求也交给它驱动——如果关掉 van-list 的初次检测再手动请求，
 * 后续滚动触发就容易失效（实测列表停在第一页不再加载）。
 */
async function onLoad() {
  const seq = ++requestSeq
  loading.value = true
  try {
    const data = await apiFetch('/api/dishes', dishListResultSchema, {
      query: {
        ...(activeCategory.value !== 'ALL' ? { categoryId: activeCategory.value } : {}),
        ...(keyword.value.trim() ? { keyword: keyword.value.trim() } : {}),
        page: page.value,
        pageSize,
      },
    })
    // 旧请求回来得比新请求晚时直接丢弃，否则会把用户刚切到的分类覆盖掉
    if (seq !== requestSeq) return
    list.value = [...list.value, ...data.items]
    total.value = data.total
    // 已加载条数追平总数就算到底了；空列表同样标记 finished，否则 van-list 会一直尝试加载
    finished.value = list.value.length >= data.total
    page.value += 1
    loaded.value = true
    // 首次请求（page 已经自增，说明刚才请求的是第一页）结果为空时才需要兜底内容。
    // 热门菜不随搜索词变化，加载一次后缓存，避免每次空结果都重复请求。
    if (!list.value.length) void loadPopular()
  } finally {
    // 只让最后一次请求负责关掉 loading，否则旧请求结束会提前灭掉转圈
    if (seq === requestSeq) {
      loading.value = false
      refreshing.value = false
    }
  }
}

/**
 * 重置列表并重新加载，用于切分类 / 搜索 / 下拉刷新。
 * 先把 loading 置 true 再调 onLoad，避免 van-list 在同一帧里重复触发一次 load。
 */
function reload() {
  list.value = []
  page.value = 1
  finished.value = false
  loading.value = true
  return onLoad()
}

/** 下拉刷新：从第一页重来，保证后台刚改的数据能立刻看到。 */
function onRefresh() {
  return reload()
}

/**
 * 加载空结果兜底的热门菜。失败只记在控制台外的静默分支：
 * 兜底内容是锦上添花，不能因为它失败再弹一次错误打断用户。
 */
async function loadPopular() {
  if (popularLoaded.value || popularLoading.value) return
  popularLoading.value = true
  try {
    const data = await apiFetch('/api/dishes/popular', popularDishesResultSchema)
    popular.value = data.items
    popularLoaded.value = true
  } catch {
    // 忽略：热门菜拿不到时仍保留空态文案，列表主流程不受影响
  } finally {
    popularLoading.value = false
  }
}

/**
 * 相近分类：优先取热门菜所属分类（说明这些分类当前有内容），
 * 热门菜分类不足时用现有分类补齐，保证至少有可点的分类入口。
 */
const relatedCategories = computed(() => {
  const popularCategoryIds = [...new Set(popular.value.map((dish) => dish.categoryId))]
  const fromPopular = categories.value.filter((c) => popularCategoryIds.includes(c.id)).slice(0, 4)
  return fromPopular.length ? fromPopular : categories.value.slice(0, 4)
})

/** 点兜底分类：清空搜索词并切到该分类，让用户从空结果回到有内容的列表。 */
function onPickCategory(categoryId: string) {
  keyword.value = ''
  activeCategory.value = categoryId
}

// 分类只在首次进入加载；首屏数据交给 van-list 的初次检测触发 onLoad。
// KeepAlive 下 onMounted 只跑一次，切 tab 回来不会重复请求。
onMounted(() => {
  loadCategories()
  loadSearchHistory()
})

// 切分类后从第一页重来，否则会出现“当前页没有数据”的空列表
watch(activeCategory, reload)

// 搜索输入做防抖：每敲一个字就请求会打爆接口，
// 300ms 大约是“用户停止输入”的体感阈值，兼顾响应速度和请求量。
let debounceTimer: ReturnType<typeof setTimeout> | undefined
watch(keyword, () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    // 防抖结束才说明用户「完成了一次搜索」，此时记录历史，避免把每个半截词都存进去
    rememberSearch(keyword.value)
    // 搜索词变化必须回到第一页，否则停在第 3 页搜索会出现空列表
    reload()
  }, 300)
})
</script>

<template>
  <div class="dishes">
    <header class="page-header">
      <h1 class="page-header__title">菜品库</h1>
      <p class="page-header__subtitle">共 {{ total }} 道菜</p>
    </header>

    <!-- 搜索胶囊：改用原生 input 而不是 van-search，是为了完全控制胶囊的描边与内高光；
         外层用 label 包住输入框，点图标区域也能聚焦，v-model 仍绑定 keyword，
         原有的 300ms 防抖与历史词记录逻辑不变 -->
    <label class="dishes__search">
      <van-icon name="search" class="dishes__search-icon" />
      <input
        v-model="keyword"
        class="dishes__search-input"
        type="search"
        enterkeyhint="search"
        placeholder="搜索菜名，如：面"
        aria-label="搜索菜名"
      />
    </label>

    <!-- 有历史且没有输入时才展示：搜索过程中把空间让给结果，避免列表被推来推去 -->
    <div v-if="history.length && !keyword.trim()" class="dishes__history">
      <div class="dishes__history-head">
        <span class="dishes__history-title">最近搜索</span>
        <button type="button" class="dishes__history-clear" @click="clearSearchHistory">
          清空
        </button>
      </div>
      <div class="dishes__history-tags">
        <button
          v-for="term in history"
          :key="term"
          type="button"
          class="app-chip app-chip--primary dishes__tag"
          @click="keyword = term"
        >
          {{ term }}
        </button>
      </div>
    </div>

    <FilterSheetSelect
      v-model="activeCategory"
      label="分类"
      :options="categoryOptions"
      class="dishes__filter"
    />

    <van-pull-refresh v-model="refreshing" class="dishes__body" @refresh="onRefresh">
      <van-list
        v-model:loading="loading"
        :finished="finished"
        :finished-text="list.length ? '没有更多了' : ''"
        @load="onLoad"
      >
        <div class="dishes__list">
          <DishCard v-for="dish in list" :key="dish.id" :dish="dish" />
        </div>

        <!-- 空态用一句说明 + 一个可执行的动作代替 van-empty 的灰色插画，
             动作直接改写筛选/搜索词，复用页面已有的 watch 重新拉取，不额外增加请求逻辑 -->
        <div v-if="loaded && !list.length" class="dishes__empty">
          <p class="dishes__empty-text">
            {{
              keyword.trim()
                ? '没有找到相关菜品，换个关键词或看看下面的推荐'
                : '这个分类还没有菜，看看下面的推荐'
            }}
          </p>
          <van-button
            v-if="keyword.trim()"
            class="app-btn app-btn--outline-primary dishes__empty-action"
            @click="keyword = ''"
          >
            清空搜索
          </van-button>
          <van-button
            v-else
            class="app-btn app-btn--outline-primary dishes__empty-action"
            @click="activeCategory = 'ALL'"
          >
            看看全部菜品
          </van-button>
        </div>

        <!-- 空结果兜底（P2-10）：分类与热门菜都可点击，避免用户停在死胡同 -->
        <section v-if="loaded && !list.length" class="dishes__fallback">
          <div v-if="relatedCategories.length" class="dishes__fallback-section">
            <h2 class="dishes__fallback-title">换个分类看看</h2>
            <div class="dishes__fallback-tags">
              <button
                v-for="category in relatedCategories"
                :key="category.id"
                type="button"
                class="app-chip app-chip--primary dishes__tag"
                @click="onPickCategory(category.id)"
              >
                {{ category.name }}
              </button>
            </div>
          </div>

          <div v-if="popular.length" class="dishes__fallback-section">
            <h2 class="dishes__fallback-title">大家都在吃</h2>
            <div class="dishes__list">
              <DishCard v-for="dish in popular" :key="dish.id" :dish="dish" />
            </div>
          </div>
        </section>
      </van-list>
    </van-pull-refresh>
  </div>
</template>

<style lang="scss" scoped>
.dishes {
  // 只写内边距：整页纸纹背景由外层 .app-shell 负责，页面再铺一层会和它叠色
  padding: 20px 16px 24px;

  &__search {
    display: flex;
    gap: 10px;
    align-items: center;
    height: 42px;
    padding: 0 16px;
    // 半透明奶油 + 内高光：让搜索框像压在纸上的一层薄膜，能看到底下的纸纹
    // 底色用 surface-strong 混合，暗夜模式下会自动变成深棕半透明，不会留一块亮色
    background: color-mix(in srgb, var(--app-color-surface-strong) 68%, transparent);
    border: 1px solid var(--app-color-line);
    border-radius: var(--app-radius-pill);
    box-shadow: var(--app-shadow-inner);

    // 聚焦时描边转主色：不加外发光，保持纸张的克制感
    &:focus-within {
      border-color: color-mix(in srgb, var(--app-color-primary) 55%, transparent);
    }
  }

  &__search-icon {
    flex: none;
    font-size: 18px;
    color: var(--app-color-text-secondary);
  }

  &__search-input {
    flex: 1;
    min-width: 0;
    padding: 0;
    font-family: inherit;
    font-size: 14px;
    color: var(--app-color-text);
    appearance: none;
    background: transparent;
    border: none;
    outline: none;

    &::placeholder {
      color: var(--app-color-text-muted);
    }

    // 去掉 WebKit 搜索框自带的清除圆点：它在胶囊里会多出一块系统灰，破坏描边
    &::-webkit-search-cancel-button {
      appearance: none;
    }
  }

  &__filter {
    margin: 12px 0;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__history {
    margin-top: 16px;
  }

  &__history-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2px;
  }

  &__history-title {
    font-size: 13px;
    color: var(--app-color-text-secondary);
  }

  // 用原生 button 而不是 van-button：清空是弱操作，不需要按钮的体积和强调
  &__history-clear {
    padding: 0;
    font-size: 13px;
    color: var(--app-color-primary-deep);
    cursor: pointer;
    background: none;
    border: none;
  }

  &__history-tags,
  &__fallback-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }

  // 历史词与兜底分类都是可点的标签：比 .app-chip 默认高度放大到 24px，手指更容易命中
  &__tag {
    height: 24px;
    padding: 0 10px;
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
    appearance: none;
  }

  &__empty {
    padding: 28px 16px 12px;
    text-align: center;
  }

  &__empty-text {
    margin: 0 0 14px;
    font-size: 14px;
    line-height: 1.6;
    color: var(--app-color-text-secondary);
  }

  // 空态按钮比常规按钮矮一档：它是引导动作，不应和页面主行动抢分量
  &__empty-action {
    height: 38px;
    padding: 0 24px;
    font-size: 14px;
  }

  &__fallback {
    margin-top: 20px;
  }

  &__fallback-section + &__fallback-section {
    margin-top: 20px;
  }

  &__fallback-title {
    margin: 0 2px 10px;
    font-family: var(--app-font-display);
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.01em;
    color: var(--app-color-text);
  }

  // van-list 的「没有更多了」默认是 Vant 的冷灰，在纸底上偏突兀
  :deep(.van-list__finished-text) {
    font-size: 12px;
    color: var(--app-color-text-muted);
  }

  // 给下拉刷新留出可拖拽高度：内容不足一屏时也能触发 refresh
  &__body {
    min-height: 60vh;
  }
}
</style>
