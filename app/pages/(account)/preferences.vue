<script setup lang="ts">
import type { Allergen } from '#shared/types/dish'
import { ALLERGEN_LABELS, PRICE_LABELS, SPICY_LABELS } from '#shared/utils/dish'

// 口味偏好页（PREF-01~04）：
// - 喜欢/不喜欢菜系：只影响推荐权重，不做硬排除；
// - 忌口/过敏原：硬过滤，保存后这些菜不会再出现在随机推荐里；
// - 辣度上限：硬约束；价格上限：软约束（超出只降权）。
// 这是从「我的」进入的二级页，不开启 KeepAlive，每次进入都拉最新数据。

const { requireLogin } = useAuth()

usePageSeo({
  title: '口味偏好',
  description: '设置喜欢的菜系、忌口与过敏原、辣度与价格上限，推荐会更贴合你。',
})
const { categories, loadCategories, categoryName } = useCategories()
const { preference, loadPreference, savePreference } = usePreferences()
const router = useRouter()

const liked = ref<string[]>([])
const disliked = ref<string[]>([])
const allergens = ref<Allergen[]>([])
const spicyMax = ref(3)
const priceMax = ref(3)
const saving = ref(false)
const ready = ref(false)

// 选项统一从共享常量生成，保证与后台表单、菜品字段含义一致。
const allergenOptions = (Object.keys(ALLERGEN_LABELS) as Allergen[]).map((code) => ({
  code,
  label: ALLERGEN_LABELS[code],
}))

const spicyText = computed(() => SPICY_LABELS[spicyMax.value] ?? '')
const priceText = computed(() => PRICE_LABELS[priceMax.value - 1] ?? '')
const categoryIds = computed(() => categories.value.map((c) => c.id))
const allergenCodes = computed(() => allergenOptions.map((o) => o.code))

/**
 * 三组多选的全选开关。已经全选时再点就是取消全选（一个按钮两态），
 * 不再额外放「取消全选」按钮占位置。
 *
 * 为什么每组分一个函数而不是抽一个通用 toggleAll(ref, options)：
 * 模板里 ref 会被自动解包，通用函数拿不到原始 Ref 就没法赋值；
 * 三处各写一行反而更直观，也不值得为此引入额外抽象。
 */
function toggleAllLiked() {
  liked.value = liked.value.length === categoryIds.value.length ? [] : [...categoryIds.value]
}

function toggleAllDisliked() {
  disliked.value = disliked.value.length === categoryIds.value.length ? [] : [...categoryIds.value]
}

function toggleAllAllergens() {
  allergens.value =
    allergens.value.length === allergenCodes.value.length ? [] : [...allergenCodes.value]
}

/** 把共享状态同步到页面本地表单，避免直接改 composable 里的对象导致未保存也生效。 */
function syncForm() {
  liked.value = [...preference.value.likedCategoryIds]
  disliked.value = [...preference.value.dislikedCategoryIds]
  allergens.value = [...preference.value.allergens]
  spicyMax.value = preference.value.spicyMax
  priceMax.value = preference.value.priceMax
}

/**
 * 喜欢与不喜欢互斥：一边变化时从另一边移除。
 * 用 watch 而不是监听组件的 change 事件，避免依赖 Vant 事件参数的具体类型；
 * 服务端 schema 也会拒绝重叠，这里提前处理让交互更顺。
 *
 * 注意：只有真的移除了元素才赋值。无条件赋值会生成新数组、触发对方 watcher，
 * 两个 watcher 互相赋值会形成无限循环（Vue 报 Maximum recursive updates exceeded）。
 */
watch(liked, (value) => {
  const next = disliked.value.filter((id) => !value.includes(id))
  if (next.length !== disliked.value.length) disliked.value = next
})
watch(disliked, (value) => {
  const next = liked.value.filter((id) => !value.includes(id))
  if (next.length !== liked.value.length) liked.value = next
})

onMounted(async () => {
  if (!requireLogin()) return
  try {
    await Promise.all([loadCategories(), loadPreference(true)])
    syncForm()
  } catch (err: unknown) {
    showToast((err as Error).message || '加载失败')
  } finally {
    ready.value = true
  }
})

async function save() {
  if (saving.value) return
  saving.value = true
  try {
    await savePreference({
      likedCategoryIds: liked.value,
      dislikedCategoryIds: disliked.value,
      allergens: allergens.value,
      spicyMax: spicyMax.value,
      priceMax: priceMax.value,
    })
    showToast('已保存，下次推荐会按新偏好来')
  } catch (err: unknown) {
    showToast((err as Error).message || '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="pref">
    <van-nav-bar title="口味偏好" left-text="返回" left-arrow @click-left="router.back()" />

    <div class="pref__body">
      <van-loading
        v-if="!ready"
        class="pref__loading"
        type="spinner"
        color="var(--app-color-primary)"
      />

      <template v-else>
        <p class="pref__tip">忌口与过敏原会直接过滤菜品，菜系喜好只影响推荐概率。</p>

        <section class="pref__section">
          <h2 class="pref__title">喜欢的菜系</h2>
          <div class="app-card pref__card">
            <div class="pref__toolbar">
              <span class="pref__count">已选 {{ liked.length }} / {{ categories.length }}</span>
              <button type="button" class="pref__select-all" @click="toggleAllLiked">
                {{ liked.length === categories.length && categories.length ? '取消全选' : '全选' }}
              </button>
            </div>
            <van-checkbox-group v-model="liked" class="pref__options">
              <van-checkbox
                v-for="cat in categories"
                :key="cat.id"
                :name="cat.id"
                class="pref__option"
              >
                {{ cat.name }}
              </van-checkbox>
            </van-checkbox-group>
          </div>
        </section>

        <section class="pref__section">
          <h2 class="pref__title">不喜欢的菜系</h2>
          <div class="app-card pref__card">
            <div class="pref__toolbar">
              <span class="pref__count">已选 {{ disliked.length }} / {{ categories.length }}</span>
              <button type="button" class="pref__select-all" @click="toggleAllDisliked">
                {{
                  disliked.length === categories.length && categories.length ? '取消全选' : '全选'
                }}
              </button>
            </div>
            <van-checkbox-group v-model="disliked" class="pref__options">
              <van-checkbox
                v-for="cat in categories"
                :key="cat.id"
                :name="cat.id"
                class="pref__option"
              >
                {{ cat.name }}
              </van-checkbox>
            </van-checkbox-group>
          </div>
        </section>

        <section class="pref__section">
          <h2 class="pref__title">忌口 / 过敏原</h2>
          <div class="app-card pref__card">
            <div class="pref__toolbar">
              <span class="pref__count"
                >已选 {{ allergens.length }} / {{ allergenOptions.length }}</span
              >
              <button type="button" class="pref__select-all" @click="toggleAllAllergens">
                {{
                  allergens.length === allergenOptions.length && allergenOptions.length
                    ? '取消全选'
                    : '全选'
                }}
              </button>
            </div>
            <van-checkbox-group v-model="allergens" class="pref__options">
              <van-checkbox
                v-for="opt in allergenOptions"
                :key="opt.code"
                :name="opt.code"
                class="pref__option"
              >
                {{ opt.label }}
              </van-checkbox>
            </van-checkbox-group>
          </div>
        </section>

        <section class="pref__section">
          <h2 class="pref__title">辣度上限</h2>
          <div class="app-card pref__card">
            <van-cell
              class="pref__cell"
              :title="spicyText"
              :label="`最高接受 ${spicyText}`"
              :border="false"
            >
              <template #right-icon>
                <span class="pref__value">{{ spicyMax }}</span>
              </template>
            </van-cell>
            <div class="pref__slider">
              <van-slider v-model="spicyMax" :min="0" :max="3" :step="1" bar-height="4px" />
            </div>
          </div>
        </section>

        <section class="pref__section">
          <h2 class="pref__title">价格上限</h2>
          <div class="app-card pref__card">
            <van-cell
              class="pref__cell"
              :title="priceText"
              :label="`人均不超过 ${priceText}`"
              :border="false"
            >
              <template #right-icon>
                <span class="pref__value">{{ priceText }}</span>
              </template>
            </van-cell>
            <div class="pref__slider">
              <van-slider v-model="priceMax" :min="1" :max="3" :step="1" bar-height="4px" />
            </div>
          </div>
        </section>

        <p class="pref__summary">
          当前：{{ liked.length ? liked.map(categoryName).join('、') : '无喜欢菜系' }} · 忌口
          {{ allergens.length }} 项 · 辣度≤{{ spicyText }}
        </p>

        <div class="pref__actions">
          <van-button block class="app-btn app-btn--solid" :loading="saving" @click="save">
            保存偏好
          </van-button>
        </div>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.pref {
  // 整页底色由 .app-shell 提供纸纹，这里只控制内容区留白。
  // 底部留白按固定按钮条的高度预扣，否则最后一段摘要会被按钮条盖住。
  &__body {
    padding: 12px 16px calc(90px + env(safe-area-inset-bottom));
  }

  &__loading {
    display: flex;
    justify-content: center;
    margin: 48px 0;
  }

  &__tip {
    margin: 0 2px 16px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--app-color-text-secondary);
  }

  &__section + &__section {
    margin-top: 18px;
  }

  // 分组标题用衬线体，和导航栏标题同族，延续纸张/食谱的年代感
  &__title {
    margin: 0 0 8px 2px;
    font-family: var(--app-font-display);
    font-size: 17px;
    font-weight: 700;
    line-height: 1.3;
    color: var(--app-color-text);
  }

  &__card {
    padding: 14px;
  }

  // 多选项较多时逐个点太麻烦，这里给每组的「全选」工具条单独留一行。
  &__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  &__count {
    font-size: 12px;
    color: var(--app-color-text-muted);
  }

  &__select-all {
    padding: 3px 12px;
    font-size: 12px;
    font-weight: 600;
    color: var(--app-color-primary-deep);
    cursor: pointer;
    background: color-mix(in srgb, var(--app-color-primary) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--app-color-primary) 40%, transparent);
    border-radius: var(--app-radius-pill);
  }

  // 选项做成三列标签墙，比 Vant 默认的复选框竖排更紧凑、更接近设计稿
  &__options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  &__option {
    // 隐藏 Vant 的勾选框图标，选中态改由整颗标签的描边 + 底色表达
    :deep(.van-checkbox__icon) {
      display: none;
    }

    :deep(.van-checkbox__label) {
      display: block;
      width: 100%;
      padding: 7px 4px;
      margin: 0;
      overflow: hidden;
      font-size: 12px;
      line-height: 1.4;
      color: var(--app-color-text-secondary);
      text-align: center;
      text-overflow: ellipsis;
      white-space: nowrap;
      background: transparent;
      border: 1px solid var(--app-color-line);
      border-radius: var(--app-radius-pill);
      transition:
        color 0.15s,
        background-color 0.15s,
        border-color 0.15s;
    }

    // 选中态挂在根节点的 aria-checked 上（Vant 的 __icon 已隐藏，不能再靠它取状态）
    &[aria-checked='true'] {
      :deep(.van-checkbox__label) {
        font-weight: 600;
        color: var(--app-color-primary-deep);
        background: color-mix(in srgb, var(--app-color-primary) 12%, transparent);
        border-color: var(--app-color-primary);
      }
    }
  }

  &__cell {
    padding: 0 0 4px;
    background: transparent;

    &::after {
      display: none;
    }

    :deep(.van-cell__title) {
      font-size: 15px;
      font-weight: 600;
      color: var(--app-color-text);
    }

    :deep(.van-cell__label) {
      margin-top: 2px;
      font-size: 12px;
      color: var(--app-color-text-secondary);
    }
  }

  &__value {
    font-size: 14px;
    color: var(--app-color-text-secondary);
  }

  &__slider {
    padding: 8px 2px 8px;
  }

  // 滑块颜色走 CSS 变量，暗色模式下不需要另写一套
  :deep(.van-slider) {
    --van-slider-active-background: var(--app-color-primary);
    --van-slider-inactive-background: var(--app-color-line);
    --van-slider-button-width: 20px;
    --van-slider-button-height: 20px;
  }

  :deep(.van-slider__button) {
    border: 2px solid var(--app-color-surface);
    box-shadow: 0 2px 6px rgb(90 55 25 / 25%);
  }

  &__summary {
    margin: 18px 2px 0;
    font-size: 12px;
    line-height: 1.7;
    color: var(--app-color-text-secondary);
  }

  // 保存按钮固定在视口底部：这页选项多、通常要滚动到底，按钮跟内容一起走容易被忽略。
  // 用 fixed 而不是 sticky：不受内容容器 padding 影响，任何滚动位置都稳稳贴在底部；
  // 底部同时补 env(safe-area-inset-bottom)，避免 iPhone 全面屏被 Home 指示条压住。
  &__actions {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 20;
    padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
    // 半透明奶油 + 模糊：内容从按钮条下方滚过时仍能隐约看见，不是一条生硬的实色横切
    background: color-mix(in srgb, var(--app-color-surface) 88%, transparent);
    border-top: 1px solid var(--app-color-line);
    backdrop-filter: blur(10px);
  }
}
</style>
