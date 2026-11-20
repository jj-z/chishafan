<script setup lang="ts">
// 找回密码申请页（AUTH-14）。
// 无论邮箱是否注册，服务端都返回同一句提示，避免这个页面被用来探测账号是否存在。

import { forgotPasswordBodySchema, forgotPasswordOkSchema } from '#shared/schemas/auth'

const router = useRouter()

usePageSeo({ title: '找回密码', description: '通过注册邮箱重置密码。' })
const form = reactive({ email: '' })
const loading = ref(false)
const submitted = ref(false)

async function handleSubmit() {
  const parsed = forgotPasswordBodySchema.safeParse(form)
  if (!parsed.success) {
    showToast(parsed.error.issues[0]?.message ?? '请检查输入')
    return
  }
  loading.value = true
  try {
    const data = await apiFetch('/api/auth/forgot-password', forgotPasswordOkSchema, {
      method: 'POST',
      body: parsed.data,
    })
    submitted.value = true

    // 只有开发环境未配置 Resend 时服务端才会回传 devResetUrl：
    // 直接跳到重置页，省去手动从日志里复制链接，生产环境不会走到这里。
    if (data.devResetUrl) {
      const url = new URL(data.devResetUrl)
      showToast({ message: '开发模式：已生成重置链接', type: 'success' })
      router.push(`${url.pathname}${url.search}`)
      return
    }

    showToast({ message: '如果该邮箱已注册，重置邮件已发送', type: 'success' })
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string; message?: string }; statusMessage?: string }
    showToast(
      e?.data?.statusMessage || e?.data?.message || e?.statusMessage || '发送失败，请稍后再试',
    )
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthShell title="找回密码" subtitle="输入注册邮箱，我们会发送 15 分钟内有效的重置链接">
    <van-form class="forgot-form" @submit="handleSubmit">
      <div class="auth-field">
        <van-field
          v-model="form.email"
          name="email"
          label="注册邮箱"
          placeholder="请输入注册时使用的邮箱"
          autocomplete="email"
          :rules="[
            { required: true, message: '请填写邮箱' },
            { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: '邮箱格式不正确' },
          ]"
        />
      </div>

      <div class="auth-submit-holder">
        <van-button block native-type="submit" :loading="loading">发送重置链接</van-button>
      </div>
    </van-form>

    <p v-if="submitted" class="forgot-notice">
      如果该邮箱已注册，重置邮件已发送，请留意收件箱与垃圾邮件。
    </p>

    <p class="auth-switch">
      想起密码了？
      <router-link to="/login">返回登录</router-link>
    </p>
  </AuthShell>
</template>

<style lang="scss" scoped>
.forgot-form {
  margin-top: 32px;
}

// 用一行奶油小卡代替 van-notice-bar：提示语和整页的纸张质感一致，也不用再覆盖 Vant 的黄底配色
.forgot-notice {
  margin: 16px 0 0;
  padding: 12px 16px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--app-color-text-secondary);
  background: rgb(255 246 229 / 62%);
  border: 1px solid rgb(201 163 118 / 45%);
  border-radius: var(--app-radius-sm);
}
</style>
