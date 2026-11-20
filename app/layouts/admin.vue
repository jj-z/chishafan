<script setup lang="ts">
// 管理端布局：左侧菜单 + 顶部账号栏。
// 与用户端 default.vue 完全独立：管理端只用 Element Plus，用户端只用 Vant，禁止混用（见 mvp-plan UI 方案）。
import zhCn from 'element-plus/es/locale/lang/zh-cn'

const route = useRoute()
const { session, logout } = useAuth()

// el-menu 的 default-active 与路由路径对齐，刷新后菜单高亮不会丢失。
const activeMenu = computed(() => route.path)

// session.user 是 nuxt-auth-utils 返回的 ComputedRef，Vue 模板不会自动解包对象里嵌套的 ref，
// 这里在 script 里解出 email，模板就能直接用字符串了。
const userEmail = computed(() => session.user.value?.email ?? '')

// 说明：模板根部包一层 el-config-provider 并挂中文语言包，
// 否则分页器、空状态等 Element Plus 内置文案会显示英文。
</script>

<template>
  <el-config-provider :locale="zhCn">
    <el-container class="admin-shell">
      <el-aside width="200px" class="admin-aside">
        <div class="admin-aside__brand">吃啥饭 · 管理后台</div>
        <el-menu :default-active="activeMenu" router class="admin-aside__menu">
          <el-menu-item index="/admin">数据看板</el-menu-item>
          <el-menu-item index="/admin/dishes">菜品管理</el-menu-item>
          <el-menu-item index="/admin/categories">分类管理</el-menu-item>
          <el-menu-item index="/admin/users">用户管理</el-menu-item>
          <el-menu-item index="/admin/audit-logs">操作审计</el-menu-item>
        </el-menu>
      </el-aside>

      <el-container class="admin-right">
        <el-header class="admin-header" height="56px">
          <span class="admin-header__user">{{ userEmail }}</span>
          <div class="admin-header__actions">
            <el-button link type="danger" @click="logout('/login')">退出登录</el-button>
          </div>
        </el-header>

        <el-main class="admin-main">
          <slot />
        </el-main>
      </el-container>
    </el-container>
  </el-config-provider>
</template>

<style lang="scss" scoped>
.admin-shell {
  // 用 flex + height 链把「视口 → 侧栏+右区 → 顶栏+主区」一层层撑满；
  // 页面内部（表格）自己处理滚动，整页不再出现外层滚动条。
  height: 100vh;
  height: 100dvh;
  display: flex;
  color: var(--app-color-text);
  overflow: hidden;

  // Element Plus 默认带一整套冷色蓝（主按钮、选中菜单、表头灰）。这里把它的 CSS 变量
  // 重映射到全局设计令牌，管理端才不会像另一个产品。
  // 只写在 .admin-shell 上而不是 :root：用户端只用 Vant，不需要这些变量。
  --el-color-primary: var(--app-color-primary);
  --el-color-primary-dark-2: var(--app-color-primary-deep);
  // light-1~9 是主色的浅色阶（hover 底、选中底），Element Plus 默认是蓝色阶，必须同步替换
  --el-color-primary-light-3: color-mix(in srgb, var(--app-color-primary) 70%, #fff);
  --el-color-primary-light-5: color-mix(in srgb, var(--app-color-primary) 45%, #fff);
  --el-color-primary-light-7: color-mix(in srgb, var(--app-color-primary) 25%, #fff);
  --el-color-primary-light-8: color-mix(in srgb, var(--app-color-primary) 16%, #fff);
  --el-color-primary-light-9: color-mix(in srgb, var(--app-color-primary) 8%, #fff);
  --el-color-danger: var(--app-color-danger);
  --el-color-success: var(--app-color-success);

  // 卡片/表格/输入框从纯白改成奶油色，和纸色底拉开层次但不突兀
  --el-bg-color: var(--app-color-surface);
  --el-bg-color-overlay: var(--app-color-surface);
  --el-fill-color-blank: var(--app-color-surface-strong);
  --el-fill-color-light: color-mix(
    in srgb,
    var(--app-color-surface-strong) 65%,
    var(--app-color-line)
  );
  --el-fill-color-lighter: var(--app-color-surface);
  --el-border-color: var(--app-color-line);
  --el-border-color-light: var(--app-color-line);
  --el-border-color-lighter: var(--app-color-line);
  --el-text-color-primary: var(--app-color-text);
  --el-text-color-regular: var(--app-color-text);
  --el-text-color-secondary: var(--app-color-text-secondary);
  --el-text-color-placeholder: var(--app-color-text-muted);
}

.admin-aside {
  display: flex;
  flex-direction: column;
  flex: 0 0 200px;
  overflow: hidden;
  background: var(--app-color-surface);
  border-right: 1px solid var(--app-color-line);
  box-shadow: var(--app-shadow-inner);

  // 品牌区用衬线体，和用户端「吃啥饭」标题保持同一套字体语言
  &__brand {
    padding: 20px 18px 16px;
    font-family: var(--app-font-display);
    font-size: 16px;
    font-weight: 900;
    letter-spacing: 0.02em;
    color: var(--app-color-primary-deep);
    border-bottom: 1px solid var(--app-color-line);
  }

  &__menu {
    flex: 1;
    padding: 10px 8px;
    background: transparent;
    border-right: none;
    --el-menu-bg-color: transparent;
    --el-menu-text-color: var(--app-color-text-secondary);
    --el-menu-active-color: var(--app-color-primary-deep);
    --el-menu-hover-bg-color: color-mix(in srgb, var(--app-color-primary) 8%, transparent);

    :deep(.el-menu-item) {
      position: relative;
      height: 42px;
      margin-bottom: 4px;
      font-size: 14px;
      border-radius: var(--app-radius-sm);

      &.is-active {
        font-weight: 600;
        background: color-mix(in srgb, var(--app-color-primary) 13%, transparent);

        // 左侧短竖条：纸色底上只靠浅浅的底色，选中状态不够一眼可见
        &::before {
          position: absolute;
          top: 50%;
          left: 0;
          width: 3px;
          height: 18px;
          content: '';
          background: var(--app-color-primary);
          border-radius: 0 3px 3px 0;
          transform: translateY(-50%);
        }
      }
    }
  }
}

.admin-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.admin-header {
  flex: 0 0 56px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 20px;
  // 半透明 + 模糊：长表格滚动时内容从顶栏下方穿过，既保证可读又不会被一块实色生硬截断
  background: color-mix(in srgb, var(--app-color-surface) 86%, transparent);
  border-bottom: 1px solid var(--app-color-line);
  backdrop-filter: blur(10px);

  // 账号做成小胶囊标签，和正文区分开，不再是一行裸文字
  &__user {
    padding: 3px 10px;
    font-size: 12px;
    color: var(--app-color-text-secondary);
    background: color-mix(in srgb, var(--app-color-surface-strong) 65%, transparent);
    border: 1px solid var(--app-color-line);
    border-radius: var(--app-radius-pill);
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 16px;
  }
}

.admin-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 20px;
  background: transparent;
  // 滚动权交给 admin-main：列表页通过 height: 100% 把表格撑满后内部滚，
  // 看板/审计等内容型页面靠 admin-main 整体滚动——两者共用这一条滚动条。
  overflow-y: auto;
}
</style>
