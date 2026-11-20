<script setup lang="ts">
// 我的收藏：真实接口 /api/favorites。KeepAlive 缓存，但重新进入（切 tab 回来）时强制刷新。

definePageMeta({ keepalive: true })

usePageSeo({ title: '我的收藏', description: '收藏过的菜都在这里，随时回来抽签或查看做法。' })

const { session, requireLogin } = useAuth()
const { dishes, loadFavorites } = useFavorites()
const loading = ref(false)
const hasLoaded = ref(false)
/** 下拉刷新状态（van-pull-refresh 的 v-model）。 */
const refreshing = ref(false)
/** 收藏接口一次返回全部（上限 50 条），滚到底部时直接结束，避免 van-list 一直转圈。 */
const noMore = ref(false)

/**
 * van-list 滚到底部时触发。
 * 收藏列表没有下一页：这里立即关掉 loading 并标记结束，
 * 否则 van-list 会一直停在「加载中」状态。
 */
function onLoadMore() {
  loading.value = false
  noMore.value = true
}

async function refresh(force = false) {
  if (!session.loggedIn.value) return
  loading.value = true
  try {
    await loadFavorites(force)
    hasLoaded.value = true
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

/** 下拉刷新：强制重新拉取，避免 KeepAlive 期间收藏数已变但页面还是旧的。 */
function onRefresh() {
  return refresh(true)
}

onMounted(() => {
  refresh()
})

// KeepAlive 下切回收藏 tab 时强制刷新，保证与后端一致；首次激活时 onMounted 已经请求过，跳过避免重复
let firstActivation = true
onActivated(() => {
  if (firstActivation) {
    firstActivation = false
    return
  }
  refresh(true)
})
</script>

<template>
  <div class="favorites">
    <header class="page-header">
      <h1 class="page-header__title">我的收藏</h1>
      <p class="page-header__subtitle">共 {{ dishes.length }} 道</p>
    </header>

    <!-- 游客不渲染列表：没有可刷新的数据，空列表还会把下面的登录引导顶到 60vh 以外 -->
    <div v-if="!session.loggedIn.value" class="favorites__guest">
      <p class="favorites__empty-text">登录后查看你的收藏</p>
      <van-button class="app-btn app-btn--outline-primary favorites__action" @click="requireLogin">
        去登录
      </van-button>
    </div>

    <van-pull-refresh v-else v-model="refreshing" class="favorites__body" @refresh="onRefresh">
      <van-list
        v-model:loading="loading"
        :finished="hasLoaded || noMore"
        :finished-text="dishes.length ? '没有更多了' : ''"
        @load="onLoadMore"
      >
        <div v-if="dishes.length" class="favorites__list">
          <DishCard v-for="dish in dishes" :key="dish.id" :dish="dish" />
        </div>

        <!-- 空态不用 van-empty 的灰色插画，改成一句说明 + 一个行动入口，和整页纸张语言一致 -->
        <div v-else-if="hasLoaded" class="favorites__empty">
          <p class="favorites__empty-text">还没有收藏，去首页发现喜欢的菜吧</p>
          <NuxtLink to="/" class="app-btn app-btn--outline-primary favorites__action">
            去逛逛
          </NuxtLink>
        </div>
      </van-list>
    </van-pull-refresh>
  </div>
</template>

<style lang="scss" scoped>
.favorites {
  // 只写内边距：纸纹背景来自外层 .app-shell，页面再铺底色会和它叠色
  padding: 20px 16px 24px;

  &__list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  // 内容不足一屏时也要能下拉触发刷新
  &__body {
    min-height: 60vh;
  }

  &__empty,
  &__guest {
    padding: 48px 16px 12px;
    text-align: center;
  }

  &__empty-text {
    margin: 0 0 16px;
    font-size: 14px;
    line-height: 1.6;
    color: var(--app-color-text-secondary);
  }

  // 空态/游客态的行动按钮：比常规按钮矮一档，避免引导入口抢过页面主内容
  &__action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 38px;
    padding: 0 24px;
    font-size: 14px;
    text-decoration: none;
  }

  // van-list 的「没有更多了」默认是 Vant 的冷灰，在纸底上偏突兀
  :deep(.van-list__finished-text) {
    font-size: 12px;
    color: var(--app-color-text-muted);
  }
}
</style>
