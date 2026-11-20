<script setup lang="ts">
// 邮箱换绑确认页（AUTH-15）：从邮件链接的 query 里取 token，进入页面即自动提交确认。
// token 是否有效由服务端判断；页面只负责「加载中 / 成功 / 失败」三种状态。
// 该页不需要登录：用户很可能在手机上打开邮件，或用另一台设备确认。

import { confirmEmailBodySchema, confirmEmailOkSchema } from '#shared/schemas/auth'

const route = useRoute()
const router = useRouter()
const { session } = useAuth()

usePageSeo({ title: '邮箱确认', description: '确认新的登录邮箱。' })

// query 可能是数组或 undefined，统一收窄成字符串，避免把脏值发给服务端。
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const status = ref<'loading' | 'success' | 'error'>('loading')
const message = ref('')
const email = ref('')

const loggedIn = computed(() => session.loggedIn.value)

onMounted(async () => {
  if (!token.value) {
    status.value = 'error'
    message.value = '确认链接无效或已缺少 token'
    return
  }

  const parsed = confirmEmailBodySchema.safeParse({ token: token.value })
  if (!parsed.success) {
    status.value = 'error'
    message.value = parsed.error.issues[0]?.message ?? '确认链接无效'
    return
  }

  try {
    const data = await apiFetch('/api/auth/confirm-email', confirmEmailOkSchema, {
      method: 'POST',
      body: parsed.data,
    })
    email.value = data.email
    status.value = 'success'
    // 如果当前浏览器正好登录着这个账号，服务端已用新邮箱重写会话；
    // 这里再拉一次，让页面头部与「我的」页立即显示新邮箱。
    if (loggedIn.value) await session.fetch()
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string; message?: string }; statusMessage?: string }
    message.value =
      e?.data?.statusMessage || e?.data?.message || e?.statusMessage || '确认失败，请重新申请换绑'
    status.value = 'error'
  }
})
</script>

<template>
  <AuthShell title="确认更换邮箱" subtitle="确认后，账号将改用新邮箱登录">
    <div v-if="status === 'loading'" class="confirm-state">
      <van-loading type="spinner" color="#c4500d" />
      <p class="confirm-state__text">正在确认，请稍候…</p>
    </div>

    <div v-else-if="status === 'success'" class="confirm-state">
      <van-icon name="passed" size="52" color="#3e7d3e" />
      <p class="confirm-state__title">邮箱已更换</p>
      <p class="confirm-state__text">
        登录邮箱已改为 <strong>{{ email }}</strong
        >，以后请使用新邮箱登录。
      </p>
      <div class="auth-submit-holder confirm-state__btn">
        <van-button block @click="router.replace('/')">返回首页</van-button>
      </div>
    </div>

    <div v-else class="confirm-state">
      <van-icon name="warning-o" size="52" color="#b93a20" />
      <p class="confirm-state__title">确认失败</p>
      <p class="confirm-state__text">{{ message }}</p>
      <div class="auth-submit-holder confirm-state__btn">
        <van-button block @click="router.replace(loggedIn ? '/me/profile' : '/login')">
          {{ loggedIn ? '去个人资料重新申请' : '去登录' }}
        </van-button>
      </div>
    </div>
  </AuthShell>
</template>

<style lang="scss" scoped>
.confirm-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 8px 0;
  text-align: center;

  &__title {
    margin: 16px 0 0;
    font-family: var(--app-font-display);
    font-size: 20px;
    font-weight: 900;
    color: var(--app-color-text);
  }

  &__text {
    margin: 10px 0 0;
    font-size: 13px;
    line-height: 1.7;
    color: var(--app-color-text-secondary);
  }

  &__btn {
    width: 100%;
    margin-top: 28px;
  }
}
</style>
