<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Dish } from '@chisha/core'

// 组件名（便于调试）
defineOptions({ name: 'DishCard' })

// 解构 props 并设置默认值
const props = withDefaults(
  defineProps<{
    dish: Dish
    showFavorite?: boolean    // 是否显示收藏按钮
    showBlacklist?: boolean  // 是否显示拉黑按钮
    isFavorite?: boolean    // 是否已收藏（由父组件控制）
    isBlacklisted?: boolean   // 是否已拉黑（由父组件控制）
  }>(),
  {
    showFavorite: true,
    showBlacklist: true,
    isFavorite: false,
    isBlacklisted: false
  }
)

const emit = defineEmits<{
  (e: 'click', dish: Dish): void                          // 卡片点击
  (e: 'favorite', dish: Dish): void                        // 收藏/取消收藏
  (e: 'blacklist', dish: Dish): void                      // 拉黑
}>()

// ---------- 数据处理 ----------
// 解构 dish 方便模板使用
const { dish } = props

console.log('DishCard props:', props.isFavorite, props.isBlacklisted, dish.id )

// 口味标签展示（限制数量）
const tasteDisplay = computed(() => {
  const tastes = dish.taste
  if (!tastes || tastes.length === 0) return '无口味'
  if (tastes.length > 3) {
    return `${tastes.slice(0, 3).join('、')} 等${tastes.length}种`
  }
  return tastes.join('、')
})

// 安全访问数值
const safeCalories = computed(() => dish.calories ?? 0)
const safePrice = computed(() => dish.price ?? 0)
const safeServings = computed(() => dish.servings ?? 1)
const safeDescription = computed(() => dish.description || '暂无描述')
const safeImage = computed(() => dish.image || '/images/default-food.png') // 需替换为实际占位图

// ---------- 事件处理 ----------
// 卡片点击
const handleCardClick = () => {
  emit('click', dish)
}

// 收藏切换
const handleFavoriteClick = (event: Event) => {
  event.stopPropagation()
  emit('favorite', dish)
}

// 拉黑（带二次确认）
const handleBlacklistClick = async (event: Event) => {
  event.stopPropagation()
  emit('blacklist', dish)
}
</script>

<template>
  <div class="dish-card" @click="handleCardClick">
    <van-card :num="safeServings" :desc="safeDescription" :title="dish.name" :thumb="safeImage" thumb-fit="cover">
      <!-- 价格 + 卡路里组合展示 -->
      <template #price>
        <div class="price-wrapper">
          <span class="price">¥{{ safePrice.toFixed(2) }}</span>
          <span class="calories">🔥 {{ safeCalories }} kcal</span>
        </div>
      </template>

      <!-- 标签 -->
      <template #tags>
        <div class="tags">
          <van-tag plain type="primary" size="medium">
            {{ dish.cuisine }}
          </van-tag>
          <van-tag plain type="success" size="medium">
            {{ tasteDisplay }}
          </van-tag>
          <!-- 可选的难度标签 -->
          <van-tag v-if="dish.difficulty" plain type="warning" size="medium">
            {{ dish.difficulty }}
          </van-tag>
        </div>
      </template>

      <!-- 底部操作按钮 -->
      <template #footer>
        <div class="footer-actions">
          <!-- 收藏按钮：有状态切换 -->
          <van-button v-if="showFavorite" size="mini" :type="isFavorite ? 'primary' : 'default'"
            :icon="isFavorite ? 'like' : 'like-o'" @click.stop="handleFavoriteClick">
            {{ isFavorite ? '已收藏' : '收藏' }}
          </van-button>

          <!-- 拉黑按钮：危险操作 -->
          <van-button v-if="showBlacklist" size="mini" :type="isBlacklisted ? 'danger' : 'default'" plain
            :icon="isBlacklisted ? 'cross' : 'minus'" @click.stop="handleBlacklistClick">
            拉黑
          </van-button>
        </div>
      </template>
    </van-card>
  </div>
</template>

<style scoped lang="scss">
.dish-card {
  cursor: pointer;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  transition: transform 0.2s, box-shadow 0.2s;
  margin-bottom: 20px;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  }

  // 覆盖 Vant Card 内部样式
  :deep(.van-card) {
    padding: 12px 14px;
  }

  :deep(.van-card__thumb) {
    border-radius: 8px;
    width: 100px;
    height: 100px;
    object-fit: cover;
  }

  :deep(.van-card__title) {
    font-weight: 600;
    font-size: 16px;
    line-height: 1.4;
  }

  :deep(.van-card__desc) {
    font-size: 13px;
    color: #999;
    margin-top: 2px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  // 价格区域
  .price-wrapper {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;

    .price {
      font-size: 20px;
      font-weight: 700;
      color: #f56c6c;
    }

    .calories {
      font-size: 13px;
      color: #999;
    }
  }

  // 标签区域
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 4px;
  }

  // 底部按钮区域
  .footer-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 4px;

    :deep(.van-button) {
      border-radius: 14px;
      font-size: 12px;
      padding: 0 12px;
      height: 28px;
      line-height: 26px;
    }
  }
}
</style>