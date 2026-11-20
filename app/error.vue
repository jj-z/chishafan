<script setup lang="ts">
// 全局错误页（P2-21）：404 与 500 都走这里。
// Nuxt 在任意路由抛错或访问不存在的路径时渲染本组件，
// 因此它必须脱离布局（没有 tabbar / 后台侧栏），只保留品牌与恢复入口。
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const router = useRouter()

const statusCode = computed(() => props.error.statusCode ?? 500)

// 404 与 500 用不同文案：前者是路径错了，后者是服务端出问题，用户能采取的动作不同。
const title = computed(() => (statusCode.value === 404 ? '这页没找到' : '出了点小问题'))

const description = computed(() => {
  if (statusCode.value === 404) return '链接可能已失效，或者菜品已经下架了。'
  return '服务暂时不可用，请稍后重试；如果反复出现，请联系管理员。'
})

useHead({
  title: `${title.value} · 吃啥饭`,
})

/** 回到首页：clearError 清掉错误状态后再跳转，否则会停留在错误页。 */
function goHome() {
  clearError({ redirect: '/' })
}

/** 回上一页；直接打开错误页时没有历史记录，兜底回首页。 */
function goBack() {
  if (import.meta.client && window.history.length > 1) router.back()
  else goHome()
}
</script>

<template>
  <main class="error-page">
    <div class="error-page__card">
      <p class="error-page__brand">吃啥饭</p>
      <p class="error-page__code">{{ statusCode }}</p>
      <h1 class="error-page__title">{{ title }}</h1>
      <p class="error-page__desc">{{ description }}</p>

      <div class="error-page__actions">
        <van-button round block type="primary" @click="goHome">回到首页</van-button>
        <van-button round block plain @click="goBack">返回上一页</van-button>
      </div>
    </div>
  </main>
</template>

<style lang="scss" scoped>
.error-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  background: var(--app-color-bg);

  &__card {
    width: 100%;
    max-width: 360px;
    padding: 32px 24px;
    text-align: center;
    background: var(--app-color-surface);
    border-radius: var(--app-radius);
    box-shadow: 0 8px 32px rgb(31 35 41 / 8%);
  }

  &__brand {
    margin: 0 0 8px;
    font-size: 14px;
    letter-spacing: 2px;
    color: var(--app-color-text-secondary);
  }

  &__code {
    margin: 0;
    font-size: 64px;
    font-weight: 700;
    line-height: 1.1;
    color: var(--app-color-primary);
  }

  &__title {
    margin: 8px 0 12px;
    font-size: 20px;
  }

  &__desc {
    margin: 0 0 24px;
    font-size: 14px;
    line-height: 1.6;
    color: var(--app-color-text-secondary);
  }

  &__actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
}
</style>
