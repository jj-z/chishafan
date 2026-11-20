<script setup lang="ts">
import type { DishDetail } from '#shared/schemas/dish'
import { dishSchema } from '#shared/schemas/dish'
import { MEAL_LABELS, ROLE_LABELS } from '#shared/utils/dish'

// 详情页：真实接口 /api/dishes/:id。不缓存——每次进入重新拉取最新数据。
// 收藏 / 就吃它两个动作走共享 composable，未登录时跳登录页并保留原地址。

const route = useRoute()
const router = useRouter()
const { isFavorite, toggleFavorite } = useFavorites()
const { isEatenToday, recordEaten, loadEatenToday } = useHistory()
const { categoryName, loadCategories } = useCategories()
const { dislikeDish } = useFeedback()

const dish = ref<DishDetail | null>(null)
const loading = ref(true)
const notFound = ref(false)
const disliking = ref(false)

// 详情页 SEO：标题/描述/分享图都跟随菜品数据，SSR 首屏还没数据时用「菜品详情」兜底。
usePageSeo({
  title: () => dish.value?.name ?? '菜品详情',
  description: () => dish.value?.description || undefined,
  image: () => dish.value?.imageUrl || undefined,
})

async function load() {
  loading.value = true
  try {
    dish.value = await apiFetch(`/api/dishes/${route.params.id}`, dishSchema)
    notFound.value = false
  } catch (err: unknown) {
    // 404 表示菜品不存在或已下架，展示空态而非错误页
    const status = (err as { statusCode?: number }).statusCode
    if (status === 404) notFound.value = true
    else showToast((err as Error).message || '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  loadCategories()
  loadEatenToday()
})

const favorite = computed(() => (dish.value ? isFavorite(dish.value.id) : false))
const eatenToday = computed(() => (dish.value ? isEatenToday(dish.value.id) : false))

async function onFavorite() {
  if (!dish.value) return
  await toggleFavorite(dish.value)
}

async function onEat() {
  if (!dish.value) return
  await recordEaten([dish.value.id])
}

/**
 * 标记不感兴趣：复用首页的 dislikeDish，详情页永远是单品所以不需要组合餐选菜弹层。
 * 成功后不跳走——用户可能还想看看做法/食材；失败或未登录时 toast/跳转都已在 composable 内部处理。
 */
async function onDislike() {
  if (!dish.value || disliking.value) return
  disliking.value = true
  try {
    const ok = await dislikeDish(dish.value.id)
    if (ok) showToast('已记录，7 天内不再推荐')
  } catch (err: unknown) {
    showToast((err as Error).message || '操作失败，请稍后再试')
  } finally {
    disliking.value = false
  }
}
</script>

<template>
  <div v-if="dish" class="detail">
    <van-nav-bar title="菜品详情" left-text="返回" left-arrow @click-left="router.back()" />

    <div class="detail__media">
      <van-image
        class="detail__image"
        :src="dish.imageUrl || undefined"
        :alt="dish.name"
        fit="cover"
        width="100%"
        height="240"
      >
        <!-- 外链失效时展示占位，避免详情页顶部出现一块纯色空白 -->
        <template #error>
          <div class="detail__media-fallback">暂无图片</div>
        </template>
      </van-image>
    </div>

    <div class="detail__body">
      <header class="detail__head">
        <div class="detail__title-row">
          <h1 class="detail__name">{{ dish.name }}</h1>
          <span class="detail__price">{{ '¥'.repeat(dish.priceLevel) }}</span>
        </div>
        <p class="detail__desc">{{ dish.description || '暂无描述' }}</p>

        <!-- 标签统一用全局 .app-chip（细描边 + 淡底），比 Vant 实心 tag 轻，不抢菜名 -->
        <div class="detail__meta">
          <span v-if="dish.servingMode === 'SINGLE'" class="app-chip app-chip--success">
            单品一餐
          </span>
          <span v-else-if="dish.role" class="app-chip">{{ ROLE_LABELS[dish.role] }}</span>
          <span class="app-chip app-chip--info">{{ categoryName(dish.categoryId) }}</span>
          <span class="app-chip">{{ MEAL_LABELS[dish.mealType] }}</span>
          <span v-if="dish.spicyLevel" class="app-chip app-chip--danger">
            辣度 {{ dish.spicyLevel }}
          </span>
          <span v-for="tag in dish.tags" :key="tag" class="app-chip">{{ tag }}</span>
        </div>
      </header>

      <section class="app-card detail__card">
        <h2 class="detail__card-title">食材</h2>
        <ul class="detail__ingredients">
          <li v-for="item in dish.ingredients" :key="item" class="detail__ingredient">
            {{ item }}
          </li>
        </ul>
      </section>

      <section v-if="dish.steps" class="app-card detail__card">
        <h2 class="detail__card-title">做法</h2>
        <p class="detail__steps">{{ dish.steps }}</p>
      </section>
    </div>

    <!-- 操作栏 fixed 贴底：正文再长也能随时收藏 / 不感兴趣 / 就吃它 -->
    <div class="detail__actions">
      <van-button
        class="app-btn app-btn--outline-neutral detail__fav"
        :icon="favorite ? 'star' : 'star-o'"
        @click="onFavorite"
      >
        {{ favorite ? '已收藏' : '收藏' }}
      </van-button>
      <van-button
        class="app-btn app-btn--outline-danger detail__dislike"
        :loading="disliking"
        @click="onDislike"
      >
        不感兴趣
      </van-button>
      <van-button class="app-btn app-btn--solid detail__eat" :disabled="eatenToday" @click="onEat">
        {{ eatenToday ? '今天吃过了' : '就吃它' }}
      </van-button>
    </div>
  </div>

  <div v-else class="detail__missing">
    <van-nav-bar title="菜品详情" left-text="返回" left-arrow @click-left="router.back()" />
    <van-loading
      v-if="loading"
      class="detail__loading"
      type="spinner"
      color="var(--app-color-primary)"
    />
    <van-empty v-else :description="notFound ? '菜品不存在或已下架' : '加载失败'" />
  </div>
</template>

<style lang="scss" scoped>
.detail {
  min-height: 100%;

  &__media {
    padding: 14px 16px 0;
  }

  // 头图单独给 16px 圆角 + 描边，和下面的奶油卡片是同一套纸片语言
  &__image {
    display: block;
    overflow: hidden;
    border: 1px solid var(--app-color-line);
    border-radius: var(--app-radius);
    box-shadow: var(--app-shadow-card);
  }

  &__media-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    font-size: 13px;
    color: var(--app-color-text-secondary);
    background: var(--app-color-media);
  }

  &__body {
    // 底部操作栏是 fixed 的，正文底部要多留出它的高度 + 安全区，否则最后一块内容会被盖住
    padding: 16px 16px calc(90px + env(safe-area-inset-bottom));
  }

  &__head {
    margin-bottom: 16px;
  }

  &__title-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  &__name {
    margin: 0;
    font-family: var(--app-font-display);
    font-size: 28px;
    font-weight: 900;
    line-height: 1.25;
    letter-spacing: 0.01em;
    color: var(--app-color-text);
  }

  &__price {
    flex: none;
    font-size: 16px;
    font-weight: 700;
    color: var(--app-color-primary-deep);
  }

  &__desc {
    margin: 8px 0 12px;
    font-size: 14px;
    line-height: 1.7;
    color: var(--app-color-text-secondary);
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  &__card {
    padding: 14px 16px;
  }

  &__card + &__card {
    margin-top: 12px;
  }

  &__card-title {
    margin: 0 0 6px;
    font-family: var(--app-font-display);
    font-size: 16px;
    font-weight: 700;
    color: var(--app-color-text);
  }

  &__ingredients {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  // 用下划线分隔食材行，比 Vant cell 的整块白底更像食谱里的一列清单
  &__ingredient {
    padding: 9px 0;
    font-size: 14px;
    color: var(--app-color-text);
    border-bottom: 1px solid var(--app-color-line);

    &:last-child {
      border-bottom: none;
    }
  }

  &__steps {
    margin: 0;
    font-size: 14px;
    line-height: 1.8;
    color: var(--app-color-text);
    white-space: pre-wrap;
  }

  // 底部操作栏：奶油半透明底 + 上边框，滚动内容从下面透出来时不会突然断层
  &__actions {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 90;
    display: flex;
    gap: 10px;
    padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
    background: color-mix(in srgb, var(--app-color-surface) 94%, transparent);
    border-top: 1px solid var(--app-color-line);
    backdrop-filter: blur(10px);
  }

  // 收藏和不感兴趣都是次要动作，给固定宽度避免抢占「就吃它」主 CTA
  &__fav {
    flex: 0 0 88px;
  }

  &__dislike {
    flex: 0 0 96px;
  }

  &__eat {
    flex: 1;
  }

  &__loading {
    display: flex;
    justify-content: center;
    margin: 24px 0;
  }

  &__missing {
    padding-bottom: 24px;
  }
}
</style>
