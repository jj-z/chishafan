<script setup lang="ts">
// 注册页：邮箱 + 密码（手机号、昵称可选）。
// 表单提交前用 registerBodySchema 校验；注册成功即登录（AUTH-04）。

import { registerBodySchema } from '#shared/schemas/auth'

const route = useRoute()
const router = useRouter()
const { session, register } = useAuth()

usePageSeo({ title: '注册', description: '注册账号即可保存收藏、就餐历史与个性化口味偏好。' })

const form = reactive({ email: '', password: '', confirmPassword: '', phone: '', nickname: '' })
const loading = ref(false)

const rules = {
  email: [
    { required: true, message: '请填写邮箱' },
    { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: '邮箱格式不正确' },
  ],
  password: [
    { required: true, message: '请填写密码' },
    { validator: (val: string) => val.length >= 8, message: '密码至少 8 位' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入密码' },
    { validator: (val: string) => val === form.password, message: '两次密码不一致' },
  ],
}

async function handleRegister() {
  // 用 schema 校验邮箱/密码/手机号/昵称；确认密码是前端概念，单独比对
  const parsed = registerBodySchema.safeParse({
    email: form.email,
    password: form.password,
    phone: form.phone || undefined,
    nickname: form.nickname || undefined,
  })
  if (!parsed.success) {
    showToast(parsed.error.issues[0]?.message ?? '请检查输入')
    return
  }
  if (form.confirmPassword !== form.password) {
    showToast('两次密码不一致')
    return
  }
  loading.value = true
  try {
    await register(parsed.data)
    showToast({ message: '注册成功', type: 'success' })
    const redirect = (route.query.redirect as string) || '/'
    router.replace(redirect)
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string; message?: string }; statusMessage?: string }
    showToast(e?.data?.statusMessage || e?.data?.message || e?.statusMessage || '注册失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (session.loggedIn.value) router.replace('/')
})
</script>

<template>
  <AuthShell title="注册账号" subtitle="收藏和就餐记录跨设备同步">
    <van-form class="register-form" @submit="handleRegister">
      <div class="auth-field">
        <van-field
          v-model="form.email"
          name="email"
          label="邮箱"
          placeholder="请输入邮箱"
          autocomplete="email"
          :rules="rules.email"
        />
      </div>

      <div class="auth-field">
        <van-field
          v-model="form.password"
          name="password"
          type="password"
          label="密码"
          placeholder="至少 8 位"
          autocomplete="new-password"
          :rules="rules.password"
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
          :rules="rules.confirmPassword"
        />
      </div>

      <div class="auth-field">
        <van-field
          v-model="form.phone"
          name="phone"
          label="手机号"
          placeholder="可选"
          autocomplete="tel"
        />
      </div>

      <div class="auth-field">
        <van-field
          v-model="form.nickname"
          name="nickname"
          label="昵称"
          placeholder="可选，用于展示"
        />
      </div>

      <div class="auth-submit-holder">
        <van-button block native-type="submit" :loading="loading">注册</van-button>
      </div>
    </van-form>

    <p class="auth-switch">
      已有账号？
      <router-link :to="{ path: '/login', query: route.query }">去登录</router-link>
    </p>
  </AuthShell>
</template>

<style lang="scss" scoped>
.register-form {
  margin-top: 28px;
}
</style>
