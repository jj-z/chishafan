<script setup lang="ts">
import type { DishDetail } from '#shared/schemas/dish'
import type { RecommendSource } from '#shared/schemas/tracking'
import { MEAL_LABELS, ROLE_LABELS, SERVING_LABELS } from '#shared/utils/dish'

// 菜品卡片是列表页与收藏页的公共 UI，禁止在页面里重复手写（见 docs/assets.md）。
// 收藏按钮调用 useFavorites.toggleFavorite，未登录时会跳登录页并保留原地址。
// track-source 只有推荐场景才传：普通列表/收藏页的点击不是推荐效果，不应计入转化率。
const props = defineProps<{
  dish: DishDetail
  trackSource?: RecommendSource
}>()

const router = useRouter()
const { isFavorite, toggleFavorite } = useFavorites()
const { categoryName } = useCategories()
const { trackClick } = useRecommendTracking()

const favorite = computed(() => isFavorite(props.dish.id))

function open() {
  // 曝光在推荐结果渲染时上报，点击在这里上报，两者用同一 dishId+source 关联（TRACK-01）。
  if (props.trackSource) trackClick(props.dish.id, props.trackSource)
  router.push(`/dishes/${props.dish.id}`)
}

function onFavorite() {
  // 点击收藏不进入详情页，由按钮上的 @click.stop 阻止冒泡。
  toggleFavorite(props.dish)
}
</script>

<template>
  <article class="dish-card" @click="open">
    <div class="dish-card__media">
      <van-image
        :src="dish.imageUrl || undefined"
        :alt="dish.name"
        fit="cover"
        width="100%"
        height="100%"
      >
        <!-- 外链图片可能失效：给占位文案而不是留一块空白，避免用户以为卡片坏了 -->
        <template #error>
          <div class="dish-card__media-fallback">暂无图片</div>
        </template>
      </van-image>
      <button
        class="dish-card__fav"
        type="button"
        :aria-label="favorite ? '取消收藏' : '收藏'"
        @click.stop="onFavorite"
      >
        <van-icon
          :name="favorite ? 'star' : 'star-o'"
          :color="favorite ? '#f0a020' : 'var(--app-color-text-muted)'"
          size="20"
        />
      </button>
    </div>

    <div class="dish-card__body">
      <div class="dish-card__title-row">
        <h3 class="dish-card__name">{{ dish.name }}</h3>
        <span class="dish-card__price">{{ '¥'.repeat(dish.priceLevel) }}</span>
      </div>
      <p class="dish-card__desc">{{ dish.description || '暂无描述' }}</p>
      <!-- 标签统一用全局 .app-chip：细描边 + 淡底，比 Vant 实心 tag 轻，不会和菜名抢视觉 -->
      <div class="dish-card__tags">
        <span v-if="dish.servingMode === 'SINGLE'" class="app-chip app-chip--success">
          {{ SERVING_LABELS.SINGLE }}
        </span>
        <span v-else-if="dish.role" class="app-chip">{{ ROLE_LABELS[dish.role] }}</span>
        <span class="app-chip app-chip--info">{{ categoryName(dish.categoryId) }}</span>
        <span class="app-chip">{{ MEAL_LABELS[dish.mealType] }}</span>
        <span v-if="dish.spicyLevel > 0" class="app-chip app-chip--danger">
          辣度 {{ dish.spicyLevel }}
        </span>
      </div>
    </div>
  </article>
</template>

<style lang="scss" scoped>
.dish-card {
  overflow: hidden;
  background: var(--app-color-surface);
  border: 1px solid var(--app-color-line);
  border-radius: var(--app-radius);
  box-shadow: var(--app-shadow-card), var(--app-shadow-inner);

  &__media {
    position: relative;
    height: 160px;
    background: var(--app-color-media);
  }

  &__media-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    font-size: 13px;
    color: var(--app-color-text-secondary);
  }

  // 收藏按钮：奶油圆底 + 金色星。
  // 不用半透明黑底，是因为卡片本身就是浅奶油色，黑底会显得脏；奶油底在图片上也足够透出来。
  &__fav {
    position: absolute;
    top: 10px;
    right: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    cursor: pointer;
    background: color-mix(in srgb, var(--app-color-surface-strong) 88%, transparent);
    border: 1px solid var(--app-color-line);
    border-radius: 50%;
    box-shadow: 0 2px 6px rgb(60 35 15 / 18%);

    // 点击时轻微回弹，给「收藏」这个高频操作一点确认感
    transition: transform 0.12s ease;

    &:active {
      transform: scale(0.9);
    }
  }

  &__body {
    padding: 12px 14px 14px;
  }

  &__title-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }

  &__name {
    margin: 0;
    font-family: var(--app-font-display);
    font-size: 19px;
    font-weight: 900;
    line-height: 1.3;
    color: var(--app-color-text);
  }

  &__price {
    flex: none;
    font-size: 13px;
    font-weight: 600;
    color: var(--app-color-primary-deep);
  }

  &__desc {
    margin: 4px 0 10px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--app-color-text-secondary);
  }

  &__tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
}
</style>
