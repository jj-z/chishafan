<script setup lang="ts">
// 认证类页面的统一外壳：米黄纸感背景 + 底部美食照片渐隐 + 居中标题区。
// 登录/注册/找回密码/重置密码/验证邮箱 五个页面共用，避免各自复制一份背景与标题样式。
// 标题用插槽外的 prop 传入，保证五个页面的标题字号、颜色、间距完全一致。

defineProps<{
  /** 页面主标题，例如「吃啥饭」「注册账号」。留空则只渲染内容 */
  title?: string
  /** 标题下方的一行说明 */
  subtitle?: string
}>()
</script>

<template>
  <div class="auth-shell">
    <!-- 装饰层：美食实拍 + 纸纹颗粒。纯视觉，不参与布局，也不进无障碍树 -->
    <div class="auth-shell__photo" aria-hidden="true" />
    <div class="auth-shell__grain" aria-hidden="true" />

    <div class="auth-shell__content">
      <header v-if="title" class="auth-shell__header">
        <h1 class="auth-shell__title">{{ title }}</h1>
        <p v-if="subtitle" class="auth-shell__subtitle">{{ subtitle }}</p>
      </header>

      <slot />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.auth-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  // dvh 让移动端浏览器地址栏收起/展开时高度不跳；不支持时回退到上面的 100vh
  min-height: 100dvh;
  // 左右留白跟随屏宽（设计稿为 12vw），宽屏封顶到 56px，避免桌面端胶囊被拉成细长条
  padding: max(56px, 7vh) clamp(16px, 12vw, 56px) 32px;
  overflow: hidden;
  // 固定暖色主题：认证页是品牌首屏，深色模式下也保持同一套视觉
  background: radial-gradient(120% 60% at 50% 0%, #f6e8cf 0%, #efdec2 45%, #e9d5b6 100%), #efdec2;
  color: #3a2412;
}

// 美食实拍只占下半屏，顶部用 mask 渐隐到米黄底色，形成“纸面渐变到餐桌”的过渡。
// 用 mask-image 而不是叠一层不透明渐变块：遮罩能保住照片的透明感，不会出现一条生硬的色带。
.auth-shell__photo {
  position: absolute;
  inset: auto 0 0;
  height: 64%;
  background: url('/images/auth/login-bg.jpg') center bottom / cover no-repeat;
  // 轻微虚化模拟大光圈景深；放大 3% 是为了让虚化后的边缘不露出底色
  filter: blur(1.2px) saturate(1.04) brightness(0.98);
  transform: scale(1.03);
  transform-origin: bottom center;
  -webkit-mask-image: linear-gradient(180deg, transparent 0%, rgb(0 0 0 / 45%) 26%, #000 62%);
  mask-image: linear-gradient(180deg, transparent 0%, rgb(0 0 0 / 45%) 26%, #000 62%);

  // 暖色滤镜 + 底部压暗，避免照片过亮抢走表单的视觉焦点
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      180deg,
      rgb(239 222 194 / 35%) 0%,
      rgb(150 96 52 / 12%) 45%,
      rgb(52 24 8 / 28%) 100%
    );
  }
}

// 纸纹颗粒：feTurbulence 是 SVG 的噪点滤镜，生成无规律的细颗粒，比重复的点阵贴图更像真实纸张。
// 只给 0.14 的不透明度并混合模式叠加，肉眼几乎察觉不到，但能消掉大面积纯色的塑料感。
.auth-shell__grain {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.14;
  mix-blend-mode: multiply;
  filter: grayscale(1);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E");
}

.auth-shell__content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  flex: 1;
  // 居中的窄列：手机上就是满宽，宽屏下收成 400px，不让表单横跨整屏
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
}

.auth-shell__header {
  text-align: center;
}

.auth-shell__title {
  margin: 0;
  font-family: 'Source Han Serif SC', 'Noto Serif SC', 'Songti SC', 'STSong', 'SimSun', serif;
  font-size: clamp(38px, 11.5vw, 54px);
  font-weight: 900;
  line-height: 1.1;
  letter-spacing: 0.02em;
  color: #c4500d;
  // 标题在纸面上微微凸起的质感：一层极淡的深色描边 + 一层上方高光
  text-shadow:
    0 1px 0 rgb(255 226 190 / 55%),
    0 -1px 0 rgb(120 40 0 / 18%);
}

.auth-shell__subtitle {
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.6;
  letter-spacing: 0.02em;
  color: #8e6b47;
}
</style>
