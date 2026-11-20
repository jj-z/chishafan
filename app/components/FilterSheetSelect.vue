<script setup lang="ts">
/**
 * 筛选行 + 底部弹层选择器：替代多行 chips。
 *
 * 为什么抽组件：首页有「餐别 + 分类」两行筛选、菜品库有「分类」一行，
 * 三处交互完全一致（点行 → 底部 action-sheet 单选），重复三份模板和状态不值得。
 * 为什么不用 chips：分类有 10 个选项，chips 会占 2-3 行屏幕高度，
 * 把首屏的推荐结果/列表内容顶下去；收成一行「当前值 + 箭头」更省空间，
 * 也与「我的」页去重设置的交互保持统一。
 */
interface FilterOption {
  key: string | number
  label: string
}

const props = defineProps<{
  label: string
  options: FilterOption[]
}>()

// v-model 绑定选中的 key；defineModel 让父组件直接 v-model 而不用手写 props/emit
const model = defineModel<string | number>({ required: true })

const showSheet = ref(false)

const currentLabel = computed(() => props.options.find((o) => o.key === model.value)?.label ?? '')

// van-action-sheet 的 actions 需要 name 字段，key 原样带回给 onSelect
const sheetActions = computed(() => props.options.map((o) => ({ name: o.label, key: o.key })))

/** 选中后写回 v-model，sheet 由 close-on-click-action 自动关闭。 */
function onSelect(action: { key: string | number }) {
  model.value = action.key
}
</script>

<template>
  <div class="filter-select">
    <button type="button" class="filter-select__row" @click="showSheet = true">
      <span class="filter-select__label">{{ label }}</span>
      <span class="filter-select__value">{{ currentLabel }}</span>
      <van-icon name="arrow-down" class="filter-select__icon" />
    </button>

    <van-action-sheet
      v-model:show="showSheet"
      :actions="sheetActions"
      cancel-text="取消"
      close-on-click-action
      @select="onSelect"
    />
  </div>
</template>

<style lang="scss" scoped>
.filter-select {
  // 胶囊筛选条：与输入框/按钮同一套「奶油半透明 + 细描边」语言，整页控件看起来才是一个系统
  &__row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 42px;
    padding: 0 16px;
    font-size: 14px;
    cursor: pointer;
    // 半透明奶油用 surface-strong 混合而不是写死米白：暗夜模式下自动变成深棕半透明
    background: color-mix(in srgb, var(--app-color-surface-strong) 68%, transparent);
    border: 1px solid var(--app-color-line);
    border-radius: var(--app-radius-pill);
    box-shadow:
      var(--app-shadow-inner),
      0 2px 8px rgb(120 80 40 / 6%);
  }

  &__label {
    flex: none;
    color: var(--app-color-text-secondary);
  }

  // 当前值左对齐占据中间，箭头推到最右，视觉上像 select 控件
  &__value {
    flex: 1;
    font-weight: 600;
    text-align: left;
    color: var(--app-color-text);
  }

  &__icon {
    color: var(--app-color-text-secondary);
  }
}
</style>
