<script setup lang="ts">
// 登录页：邮箱（或手机号）+ 密码登录。
// 表单提交前用 loginBodySchema 校验，避免空字段或纯空格提交到服务端。
// 视觉上复用了 AuthShell（纸感背景 + 标题区）和全局的 .auth-field / .auth-submit-holder。

import { loginBodySchema } from '#shared/schemas/auth'

const route = useRoute()
const router = useRouter()
const { session, login } = useAuth()

usePageSeo({ title: '登录', description: '登录后可保存收藏、就餐历史与口味偏好。' })

const loginForm = reactive({ login: '', password: '' })
const loading = ref(false)

async function handleLogin() {
  // 前端先过一遍 schema：trim 后为空、纯空格等情况直接提示，不发请求
  const parsed = loginBodySchema.safeParse(loginForm)
  if (!parsed.success) {
    showToast(parsed.error.issues[0]?.message ?? '请检查输入')
    return
  }
  loading.value = true
  try {
    await login(parsed.data)
    const redirect = (route.query.redirect as string) || '/'
    router.replace(redirect)
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string; message?: string }; statusMessage?: string }
    showToast(e?.data?.statusMessage || e?.data?.message || e?.statusMessage || '登录失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  // 已经登录就直接跳首页
  if (session.loggedIn.value) router.replace('/')
})
</script>

<template>
  <AuthShell title="吃啥饭" subtitle="登录后收藏与就餐记录跨设备同步">
    <van-form class="login-form" @submit="handleLogin">
      <div class="auth-field">
        <van-field
          v-model="loginForm.login"
          name="login"
          label="邮箱 / 手机号"
          placeholder="请输入邮箱或手机号"
          autocomplete="username"
          :rules="[{ required: true, message: '请填写邮箱或手机号' }]"
        />
      </div>

      <div class="auth-field">
        <van-field
          v-model="loginForm.password"
          name="password"
          type="password"
          label="密码"
          placeholder="请输入密码"
          autocomplete="current-password"
          :rules="[{ required: true, message: '请填写密码' }]"
        />
      </div>

      <div class="auth-submit-holder">
        <van-button block native-type="submit" :loading="loading">登录</van-button>
      </div>
    </van-form>

    <p class="auth-switch">
      还没有账号？
      <router-link :to="{ path: '/register', query: route.query }">去注册</router-link>
    </p>

    <p class="auth-switch auth-switch--minor">
      <router-link to="/forgot-password">忘记密码？</router-link>
    </p>
  </AuthShell>
</template>

<style lang="scss" scoped>
// 标题区与表单之间留出呼吸感，和设计稿里标题到第一个胶囊的间距一致
.login-form {
  margin-top: 32px;
}
</style>
