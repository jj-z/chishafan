<script setup lang="ts">
// 用户端统一布局：内容区 + 底部导航。管理端会使用另一套 Element Plus 布局，不复用这里。
const route = useRoute()

/**
 * 只有四个主 tab 页显示底部导航；二级页（聊天 / 就餐记录 / 口味偏好 / 菜品详情 / 登录注册）
 * 有自己的顶部返回栏，再叠一条 tabbar 会占掉 50px 且两个导航语义打架。
 * 用路由白名单判断而不是新建一套 layout：两者的区别只有「有没有 tabbar」，不值得拆布局。
 */
const TAB_PATHS = ['/', '/dishes', '/favorites', '/me']
const hideTabbar = computed(() => !TAB_PATHS.includes(route.path))
</script>

<template>
  <div class="app-shell">
    <main class="app-main" :class="{ 'app-main--full': hideTabbar }">
      <slot />
    </main>

    <!-- 导航色与全局设计令牌保持一致的手工值：Vant 的 active-color 只接受颜色字符串，读不到 CSS 变量 -->
    <van-tabbar v-if="!hideTabbar" route active-color="#e4681f" inactive-color="#8b6a47">
      <van-tabbar-item to="/" icon="smile-o">吃啥饭</van-tabbar-item>
      <van-tabbar-item to="/dishes" icon="orders-o">菜品库</van-tabbar-item>
      <van-tabbar-item to="/favorites" icon="star-o">收藏</van-tabbar-item>
      <van-tabbar-item to="/me" icon="user-o">我的</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<style lang="scss" scoped>
// 这里不要再给 .app-shell 写 background：scoped 会编译成 .app-shell[data-v-x]，
// 权重高于 main.scss 里的 .app-shell，会把纸纹颗粒和上下暗角一起覆盖成平涂色。
// 底色与质感统一由全局 .app-shell 负责。
.app-main {
  // 给底部 tabbar 留出空间，否则最后一行内容会被盖住
  padding-bottom: calc(50px + env(safe-area-inset-bottom));

  // 无 tabbar 的二级页不需要这段留白，否则底部会多出一条空隙。
  &--full {
    padding-bottom: 0;
  }
}
</style>
