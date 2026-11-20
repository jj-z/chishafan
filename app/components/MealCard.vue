<script setup lang="ts">
import type { Meal } from '#shared/schemas/dish'
import type { RecommendSource } from '#shared/schemas/tracking'

// 一餐的展示组件：单品餐只显示一道菜；组合餐先显示主食，再列 1~3 道配菜。
// 推荐结果必须是“一餐”，直接把一道菜当一餐展示是错误的（见 domain MEAL-01）。
// trackSource 透传给内部 DishCard，用于推荐链路的点击埋点（TRACK-01）。
const props = defineProps<{
  meal: Meal
  trackSource?: RecommendSource
}>()
</script>

<template>
  <section class="meal">
    <header class="meal__head">
      <span class="meal__kind" :class="`meal__kind--${meal.kind.toLowerCase()}`">
        {{ meal.kind === 'SINGLE' ? '单品一餐' : '组合一餐' }}
      </span>
      <span class="meal__count">
        {{ meal.kind === 'SINGLE' ? '一份就能吃饱' : `${meal.dishes.length} 菜 + 主食` }}
      </span>
    </header>

    <div v-if="meal.kind === 'COMBO'" class="meal__staple">
      <span class="meal__staple-label">主食</span>
      <span class="meal__staple-name">{{ meal.staple }}</span>
    </div>

    <div class="meal__dishes">
      <DishCard
        v-for="dish in meal.dishes"
        :key="dish.id"
        :dish="dish"
        :track-source="props.trackSource"
      />
    </div>
  </section>
</template>

<style lang="scss" scoped>
.meal {
  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  &__kind {
    padding: 2px 10px;
    font-size: 12px;
    border: 1px solid transparent;
    border-radius: 999px;

    // 用淡底 + 同色细描边，和卡片内其它标签保持同一套“纸面印章”的观感
    &--single {
      color: var(--app-color-success);
      background: rgb(62 125 62 / 8%);
      border-color: rgb(62 125 62 / 35%);
    }

    &--combo {
      color: var(--app-color-primary-deep);
      background: rgb(228 104 31 / 8%);
      border-color: rgb(228 104 31 / 35%);
    }
  }

  &__count {
    font-size: 12px;
    color: var(--app-color-text-secondary);
  }

  &__staple {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    margin-bottom: 10px;
    background: var(--app-color-surface);
    border: 1px dashed var(--app-color-line);
    border-radius: var(--app-radius-sm);
  }

  &__staple-label {
    padding: 1px 8px;
    font-size: 11px;
    color: var(--app-color-text-secondary);
    background: color-mix(in srgb, var(--app-color-surface-strong) 60%, transparent);
    border: 1px solid var(--app-color-line);
    border-radius: 999px;
  }

  &__staple-name {
    font-size: 15px;
    font-weight: 600;
  }

  &__dishes {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
}
</style>
