<script setup lang="ts">
// 全局入口：包一层 van-config-provider 以切换 Vant 组件的明暗主题。
// theme=dark 时 Vant 会给容器加 .van-theme-dark 类，其内部所有 Vant 组件
// 自动切换到深色变量，无需逐个组件处理。
const { isDark } = useThemeMode()

// 自定义的 --app-* 变量（背景/文字色）不属于 Vant 组件体系，
// 通过 <html> 上的 dark 类在 main.scss 里统一覆盖。
// 用 watchEffect 跟随 isDark（含 auto 模式下系统深浅色变化）。
watchEffect(() => {
  // SSR 端没有 document，watchEffect 在服务端跑到这步时直接跳过
  if (import.meta.client) {
    document.documentElement.classList.toggle('dark', isDark.value)
  }
})
</script>

<template>
  <van-config-provider :theme="isDark ? 'dark' : 'light'">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </van-config-provider>
</template>
