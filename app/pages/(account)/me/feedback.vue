<script setup lang="ts">
import type { FeedbackItem } from '#shared/schemas/feedback'
import { feedbackListResultSchema } from '#shared/schemas/feedback'

// 「不感兴趣的菜」管理页（PREF-11）：查看 7 天内会影响推荐的反馈并逐条撤销。
// KeepAlive 缓存列表；切回本页时强制刷新，避免在别处撤销后仍显示旧数据。

definePageMeta({ keepalive: true })

usePageSeo({ title: '不感兴趣的菜', description: '管理最近标记为「不感兴趣」的菜，可随时撤销。' })

const { session, requireLogin } = useAuth()
const { undoDislike } = useFeedback()
const router = useRouter()

const items = ref<FeedbackItem[]>([])
const loading = ref(false)
const hasLoaded = ref(false)
/** 正在撤销的菜品 id：只让被点的那一行转圈，避免整页 loading。 */
const revokingId = ref<string | null>(null)

async function load() {
  if (!session.loggedIn.value) {
    items.value = []
    hasLoaded.value = false
    return
  }
  loading.value = true
  try {
    const data = await apiFetch('/api/feedback', feedbackListResultSchema)
    items.value = data.items
    hasLoaded.value = true
  } catch (err: unknown) {
    showToast((err as Error).message || '加载失败，请稍后再试')
  } finally {
    loading.value = false
  }
}

onMounted(load)

// KeepAlive 下切回本页时强制刷新；首次激活时 onMounted 已经请求过，跳过避免重复
let firstActivation = true
onActivated(() => {
  if (firstActivation) {
    firstActivation = false
    return
  }
  load()
})

/**
 * 撤销一条反馈：接口幂等，成功后直接从列表移除，不整页重拉。
 * 撤销后该菜会立即回到推荐池，不需要额外操作。
 */
async function revoke(dishId: string) {
  if (revokingId.value) return
  revokingId.value = dishId
  try {
    await undoDislike(dishId)
    items.value = items.value.filter((item) => item.dish.id !== dishId)
    showToast('已撤销，这道菜会重新出现在推荐里')
  } catch (err: unknown) {
    showToast((err as Error).message || '撤销失败，请稍后再试')
  } finally {
    revokingId.value = null
  }
}
</script>

<template>
  <div class="feedback">
    <!-- 这个页面不在四个主 tab 白名单里，tabbar 是隐藏的。
         必须自己提供返回入口，否则用户进来后只能靠浏览器后退才能离开。 -->
    <van-nav-bar title="不感兴趣的菜" left-text="返回" left-arrow @click-left="router.back()" />

    <div class="feedback__body">
      <p class="feedback__tip">标记后 7 天内不再推荐这道菜，随时可以在这里撤销。</p>

      <van-loading
        v-if="loading && !hasLoaded"
        class="feedback__loading"
        type="spinner"
        color="var(--app-color-primary)"
      />

      <template v-else-if="session.loggedIn.value">
        <!-- 一行一条记录，整组共用一张奶油卡片，靠 1px 分割线分界 -->
        <div v-if="items.length" class="app-card feedback__card">
          <div v-for="item in items" :key="item.dish.id" class="feedback__row">
            <div class="feedback__info">
              <p class="feedback__name">{{ item.dish.name }}</p>
              <p class="feedback__meta">
                反馈于 {{ item.createdAt.slice(0, 10) }}，7 天内不再出现在推荐里
              </p>
            </div>
            <van-button
              class="app-btn app-btn--outline-primary feedback__revoke"
              :loading="revokingId === item.dish.id"
              :disabled="revokingId !== null"
              @click.stop="revoke(item.dish.id)"
            >
              撤销
            </van-button>
          </div>
        </div>

        <div v-else-if="hasLoaded" class="feedback__empty">
          <p class="feedback__empty-text">还没有标记过不感兴趣的菜</p>
          <NuxtLink to="/dishes" class="app-btn app-btn--outline-primary feedback__action">
            去逛逛菜品库
          </NuxtLink>
        </div>
      </template>

      <div v-else class="feedback__empty">
        <p class="feedback__empty-text">登录后查看你的不感兴趣记录</p>
        <van-button block class="app-btn app-btn--solid feedback__action" @click="requireLogin">
          去登录
        </van-button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.feedback {
  // 整页底色由 .app-shell 提供纸纹，这里只控制内容区留白
  &__body {
    padding: 12px 16px 24px;
  }

  &__tip {
    margin: 0 2px 16px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--app-color-text-secondary);
  }

  &__loading {
    display: flex;
    justify-content: center;
    margin: 48px 0;
  }

  &__card {
    overflow: hidden;
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;

    // 用相邻兄弟画分割线，最后一行不会多出一条悬空的线
    & + & {
      border-top: 1px solid var(--app-color-line);
    }
  }

  &__info {
    flex: 1;
    min-width: 0;
  }

  &__name {
    margin: 0;
    overflow: hidden;
    font-size: 15px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--app-color-text);
  }

  &__meta {
    margin: 4px 0 0;
    font-size: 11px;
    line-height: 1.5;
    color: var(--app-color-text-secondary);
  }

  // 行内按钮必须比通用 .app-btn 矮：46px 的行内按钮会把每一行撑成一大块
  &__revoke {
    flex: none;
    height: 32px;
    padding: 0 14px;
    font-size: 13px;
  }

  &__empty {
    padding: 48px 16px 12px;
    text-align: center;
  }

  &__empty-text {
    margin: 0 0 16px;
    font-size: 14px;
    line-height: 1.6;
    color: var(--app-color-text-secondary);
  }

  // 空态/游客态的行动入口：比常规按钮矮一档，避免抢夺页面主内容
  &__action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 38px;
    padding: 0 24px;
    font-size: 14px;
    text-decoration: none;
  }
}
</style>
