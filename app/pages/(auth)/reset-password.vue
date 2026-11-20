<script setup lang="ts">
// 重置密码页（AUTH-14）：从邮件链接的 query 里取 token，设置新密码。
// token 是否有效由服务端判断；页面只做空 token 与两次密码一致的本地校验。

import { resetPasswordBodySchema, resetPasswordOkSchema } from '#shared/schemas/auth'

const route = useRoute()
const router = useRouter()

usePageSeo({ title: '重置密码', description: '设置新密码后即可重新登录。' })

// query 可能是数组或 undefined，统一收窄成字符串，避免把脏值发给服务端。
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const form = reactive({ password: '', confirmPassword: '' })
const loading = ref(false)

async function handleSubmit() {
  if (!token.value) {
    showToast('重置链接无效，请重新申请')
    return
  }
  // 确认密码是前端概念，schema 里没有这个字段，单独比对。
  if (form.confirmPassword !== form.password) {
    showToast('两次密码不一致')
    return
  }

  const parsed = resetPasswordBodySchema.safeParse({ token: token.value, password: form.password })
  if (!parsed.success) {
    showToast(parsed.error.issues[0]?.message ?? '请检查输入')
    return
  }

  loading.value = true
  try {
    await apiFetch('/api/auth/reset-password', resetPasswordOkSchema, {
      method: 'POST',
      body: parsed.data,
    })
    showToast({ message: '密码已重置，请用新密码登录', type: 'success' })
    router.replace('/login')
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string; message?: string }; statusMessage?: string }
    showToast(
      e?.data?.statusMessage || e?.data?.message || e?.statusMessage || '重置失败，请重新申请',
    )
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthShell title="设置新密码" subtitle="重置链接 15 分钟内有效，且只能使用一次">
    <template v-if="token">
      <van-form class="reset-form" @submit="handleSubmit">
        <div class="auth-field">
          <van-field
            v-model="form.password"
            name="password"
            type="password"
            label="新密码"
            placeholder="至少 8 位"
            autocomplete="new-password"
            :rules="[
              { required: true, message: '请填写新密码' },
              { validator: (val: string) => val.length >= 8, message: '密码至少 8 位' },
            ]"
          />
        </div>

        <div class="auth-field">
          <van-field
            v-model="form.confirmPassword"
            name="confirmPassword"
            type="password"
            label="确认密码"
            placeholder="再输一次"
            autocomplete="new-password"
            :rules="[{ required: true, message: '请再次输入密码' }]"
          />
        </div>

        <div class="auth-submit-holder">
          <van-button block native-type="submit" :loading="loading">重置密码</van-button>
        </div>
      </van-form>
    </template>

    <!-- 链接缺失/失效时没有表单可填，给一个明确出口，而不是让用户卡在空白页 -->
    <div v-else class="reset-invalid">
      <p class="reset-invalid__text">重置链接无效或已缺少 token，请重新申请一封邮件。</p>
      <div class="auth-submit-holder">
        <van-button block @click="router.replace('/forgot-password')">重新申请</van-button>
      </div>
    </div>

    <p class="auth-switch">
      想起密码了？
      <router-link to="/login">返回登录</router-link>
    </p>
  </AuthShell>
</template>

<style lang="scss" scoped>
.reset-form {
  margin-top: 32px;
}

.reset-invalid {
  margin-top: 32px;
  text-align: center;

  &__text {
    margin: 0 0 8px;
    font-size: 13px;
    line-height: 1.7;
    color: var(--app-color-text-secondary);
  }
}
</style>
