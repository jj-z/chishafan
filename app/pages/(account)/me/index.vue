<script setup lang="ts">
import { meOkSchema, meSummarySchema } from '#shared/schemas/me'

// “我的”页：真实接口 /api/me/summary。登录后展示统计；游客展示登录/注册入口。
// KeepAlive：切 tab 保留状态；重新进入时强制刷新统计。
// 退出登录后清空收藏与历史等用户数据，防止上一个账号的残留。

definePageMeta({ keepalive: true })

usePageSeo({ title: '我的', description: '查看就餐统计、收藏与历史，管理口味偏好和个人资料。' })

const { session, logout } = useAuth()
const { clearFavorites } = useFavorites()
const { clearHistory } = useHistory()
const { clearPreference } = usePreferences()
// 推荐去重窗口设置与首页抽签共享（useHistoryDays 内部用 useState + localStorage）
const { historyDays } = useHistoryDays()
// 主题模式设置：app.vue 消费 isDark 切换全局明暗，这里只管选择
const { themeMode } = useThemeMode()
const router = useRouter()

// 主题三档：auto 跟随系统深浅色设置（系统切换时页面跟着变）
const themeOptions = [
  { key: 'light' as const, label: '明亮', sub: '始终使用浅色界面' },
  { key: 'dark' as const, label: '暗夜', sub: '始终使用深色界面' },
  { key: 'auto' as const, label: '跟随系统', sub: '与系统深浅色设置保持一致' },
]
const showThemeSheet = ref(false)
const themeActions = themeOptions.map((o) => ({ name: o.label, subname: o.sub, key: o.key }))
const currentThemeLabel = computed(
  () => themeOptions.find((o) => o.key === themeMode.value)?.label ?? '跟随系统',
)

function onSelectTheme(action: { key: 'light' | 'dark' | 'auto' }) {
  themeMode.value = action.key
}

// 三档可选：0 不限（允许推荐最近吃过的）、3/7 天窗口
const dedupeOptions = [
  { key: 0, label: '不限', sub: '允许推荐最近吃过的菜' },
  { key: 3, label: '3 天', sub: '近 3 天吃过的不再推荐' },
  { key: 7, label: '7 天', sub: '近 7 天吃过的不再推荐' },
]

// 去重选择用 van-action-sheet 底部弹层而不是在 cell 里塞 chips：
// cell 是单行 flex 布局，chips 会被挤压换行（已实测很难看）；
// 底部 sheet 是移动端标准的单选交互，选项有空间带说明文案。
const showDedupeSheet = ref(false)
const dedupeActions = dedupeOptions.map((o) => ({ name: o.label, subname: o.sub, key: o.key }))
const currentDedupeLabel = computed(
  () => dedupeOptions.find((o) => o.key === historyDays.value)?.label ?? '3 天',
)

/** action-sheet 选中回调：写入共享状态即同步到首页，sheet 由 close-on-click-action 自动关闭。 */
function onSelectDedupe(action: { key: number }) {
  historyDays.value = action.key
}

interface Summary {
  nickname: string | null
  email: string
  favoriteCount: number
  historyCount: number
}

const summary = ref<Summary | null>(null)
const loading = ref(false)

// 注销账号：进程不可逆，必须二次确认；文案要写明邮箱/手机号不可再注册（AUTH-12 / DATA-03）。
const showDeleteDialog = ref(false)
const deleting = ref(false)

/** 从 $fetch 错误里取服务端中文提示（与资料页同一套约定）。 */
function errorMessage(err: unknown, fallback: string) {
  const e = err as { data?: { statusMessage?: string; message?: string }; statusMessage?: string }
  return e?.data?.statusMessage || e?.data?.message || e?.statusMessage || fallback
}

async function loadSummary() {
  if (!session.loggedIn.value) {
    summary.value = null
    return
  }
  loading.value = true
  try {
    const data = await apiFetch('/api/me/summary', meSummarySchema)
    summary.value = data
  } catch (err: unknown) {
    showToast((err as Error).message || '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadSummary)

// KeepAlive 下切回“我的” tab 时强制刷新统计
let firstActivation = true
onActivated(() => {
  if (firstActivation) {
    firstActivation = false
    return
  }
  loadSummary()
})

async function onLogout() {
  await logout()
  // 清空本地用户相关状态，防止下一个账号看到上一个账号的数据
  clearFavorites()
  clearHistory()
  clearPreference()
  summary.value = null
}

/**
 * 注销确认回调（van-dialog 的 before-close）：
 * 返回 true 时关闭弹窗，返回 false 时保持打开，让用户看到失败原因后重试。
 */
async function onDeleteConfirm(action: string): Promise<boolean> {
  if (action !== 'confirm') return true
  deleting.value = true
  try {
    await apiFetch('/api/me', meOkSchema, { method: 'DELETE' })
    // 服务端已清会话，这里同步前端登录态并清空所有用户缓存。
    await session.fetch()
    clearFavorites()
    clearHistory()
    clearPreference()
    summary.value = null
    showToast({ message: '账号已注销', type: 'success' })
    router.replace('/')
    return true
  } catch (err: unknown) {
    showToast(errorMessage(err, '注销失败，请稍后再试'))
    return false
  } finally {
    deleting.value = false
  }
}

function goLogin() {
  router.push('/login')
}

function goRegister() {
  router.push('/register')
}

/** 已登录时点头部进入个人资料；游客点头部不跳转，避免把他们直接扔到 401 页面。 */
function goProfile() {
  if (!session.loggedIn.value) return
  router.push('/me/profile')
}
</script>

<template>
  <div class="me">
    <h1 class="me__page-title">我的</h1>

    <header
      class="me__profile"
      :class="{ 'me__profile--link': session.loggedIn.value }"
      @click="goProfile"
    >
      <div class="me__avatar">
        <van-icon name="user-o" size="28" color="#fff5e6" />
      </div>
      <div class="me__identity">
        <p class="me__name">{{ summary?.nickname || summary?.email || '未登录' }}</p>
        <p class="me__hint">
          {{ session.loggedIn.value ? '已登录，数据跨设备同步' : '登录后收藏与历史跨设备同步' }}
        </p>
      </div>
      <van-icon v-if="session.loggedIn.value" name="arrow" class="me__arrow" />
    </header>

    <van-loading v-if="loading" class="me__loading" type="spinner" color="#c4500d" />

    <!-- 已登录：统计条 + 设置分组。统计用可点的大数字，比一行「收藏数 12」更容易扫读 -->
    <template v-if="session.loggedIn.value && summary">
      <section class="app-card me__stats">
        <button type="button" class="me__stat" @click="router.push('/favorites')">
          <strong>{{ summary.favoriteCount }}</strong>
          <span>收藏</span>
        </button>
        <button type="button" class="me__stat" @click="router.push('/history')">
          <strong>{{ summary.historyCount }}</strong>
          <span>就餐记录</span>
        </button>
        <button type="button" class="me__stat" @click="showDedupeSheet = true">
          <strong>{{ currentDedupeLabel }}</strong>
          <span>去重窗口</span>
        </button>
      </section>

      <section class="app-card me__menu">
        <button type="button" class="me__row" @click="showThemeSheet = true">
          <van-icon name="bulb-o" class="me__row-icon" />
          <span class="me__row-main">
            <span class="me__row-title">主题设置</span>
            <span class="me__row-label">界面明暗</span>
          </span>
          <span class="me__row-value">{{ currentThemeLabel }}</span>
          <van-icon name="arrow" class="me__row-arrow" />
        </button>

        <button type="button" class="me__row" @click="router.push('/chat')">
          <van-icon name="chat-o" class="me__row-icon" />
          <span class="me__row-main">
            <span class="me__row-title">AI 帮我选</span>
            <span class="me__row-label">和 AI 聊聊，从真实菜品里挑出这一餐</span>
          </span>
          <van-icon name="arrow" class="me__row-arrow" />
        </button>

        <button type="button" class="me__row" @click="router.push('/preferences')">
          <van-icon name="like-o" class="me__row-icon" />
          <span class="me__row-main">
            <span class="me__row-title">口味偏好</span>
            <span class="me__row-label">忌口、喜欢的菜系与辣度上限</span>
          </span>
          <van-icon name="arrow" class="me__row-arrow" />
        </button>

        <button type="button" class="me__row" @click="router.push('/me/feedback')">
          <van-icon name="close" class="me__row-icon" />
          <span class="me__row-main">
            <span class="me__row-title">不感兴趣的菜</span>
            <span class="me__row-label">7 天内不再推荐，可随时撤销</span>
          </span>
          <van-icon name="arrow" class="me__row-arrow" />
        </button>

        <button type="button" class="me__row" @click="showDedupeSheet = true">
          <van-icon name="replay" class="me__row-icon" />
          <span class="me__row-main">
            <span class="me__row-title">推荐去重窗口</span>
            <span class="me__row-label">几天内吃过的菜不再重复推荐</span>
          </span>
          <span class="me__row-value">{{ currentDedupeLabel }}</span>
          <van-icon name="arrow" class="me__row-arrow" />
        </button>
      </section>

      <div class="me__actions">
        <van-button block class="app-btn app-btn--outline-primary" @click="onLogout">
          退出登录
        </van-button>
        <!-- 注销不可逆：弱化成纯文字链，和上面的退出按钮拉开危险层级 -->
        <button type="button" class="me__delete" @click="showDeleteDialog = true">注销账号</button>
      </div>
    </template>

    <!-- 游客：AI 也能用，所以单独给入口，再给登录/注册 -->
    <template v-else-if="!loading && !session.loggedIn.value">
      <section class="app-card me__menu">
        <button type="button" class="me__row" @click="router.push('/chat')">
          <van-icon name="chat-o" class="me__row-icon" />
          <span class="me__row-main">
            <span class="me__row-title">AI 帮我选</span>
            <span class="me__row-label">不登录也能用</span>
          </span>
          <van-icon name="arrow" class="me__row-arrow" />
        </button>
        <button type="button" class="me__row" @click="showThemeSheet = true">
          <van-icon name="bulb-o" class="me__row-icon" />
          <span class="me__row-main">
            <span class="me__row-title">主题设置</span>
          </span>
          <span class="me__row-value">{{ currentThemeLabel }}</span>
          <van-icon name="arrow" class="me__row-arrow" />
        </button>
      </section>

      <div class="me__guest-actions">
        <van-button block class="app-btn app-btn--solid" @click="goLogin">登录</van-button>
        <van-button block class="app-btn app-btn--outline-primary" @click="goRegister">
          注册账号
        </van-button>
      </div>
    </template>

    <van-action-sheet
      v-model:show="showThemeSheet"
      :actions="themeActions"
      cancel-text="取消"
      close-on-click-action
      @select="onSelectTheme"
    />

    <van-action-sheet
      v-model:show="showDedupeSheet"
      :actions="dedupeActions"
      cancel-text="取消"
      close-on-click-action
      @select="onSelectDedupe"
    />

    <van-dialog
      v-model:show="showDeleteDialog"
      title="注销账号"
      show-cancel-button
      confirm-button-text="确认注销"
      confirm-button-color="#b93a20"
      :before-close="onDeleteConfirm"
    >
      <p class="me__delete-tip">
        注销后将无法登录，邮箱与手机号不可再注册；收藏与就餐历史会保留但无法再访问。
      </p>
      <p v-if="deleting" class="me__delete-tip me__delete-tip--loading">正在注销…</p>
    </van-dialog>
  </div>
</template>

<style lang="scss" scoped>
.me {
  padding: 16px 16px 24px;
}

.me__page-title {
  margin: 8px 0 16px;
  font-family: var(--app-font-display);
  font-size: 32px;
  font-weight: 900;
  line-height: 1.2;
  letter-spacing: 0.02em;
  color: var(--app-color-text);
}

// 用户卡片：橙色渐变头像 + 细环，让「我的」第一眼有品牌色锚点
.me__profile {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 16px;
  background: var(--app-color-surface);
  border: 1px solid var(--app-color-line);
  border-radius: var(--app-radius);
  box-shadow: var(--app-shadow-card), var(--app-shadow-inner);

  // 只有登录后才可点：加按压反馈，让「头部可进入资料页」有可感知的交互线索
  &--link:active {
    opacity: 0.88;
  }
}

.me__avatar {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  background: linear-gradient(160deg, #f5821f 0%, #cf4a0e 100%);
  border: 2px solid rgb(255 247 232 / 80%);
  border-radius: 50%;
  box-shadow: 0 4px 12px rgb(200 90 20 / 28%);
}

.me__identity {
  min-width: 0;
}

.me__name {
  margin: 0;
  overflow: hidden;
  font-family: var(--app-font-display);
  font-size: 19px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-color-text);
}

.me__hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--app-color-text-secondary);
}

.me__arrow {
  margin-left: auto;
  color: var(--app-color-text-muted);
}

.me__loading {
  display: flex;
  justify-content: center;
  margin: 24px 0;
}

// 统计条：三个等宽格子，用细分隔线而不是卡片堆叠，信息密度更高
.me__stats {
  display: flex;
  margin-top: 12px;
  overflow: hidden;
}

.me__stat {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  align-items: center;
  padding: 14px 4px;
  cursor: pointer;
  background: transparent;
  border: none;

  & + & {
    border-left: 1px solid var(--app-color-line);
  }

  &:active {
    background: rgb(228 104 31 / 6%);
  }

  strong {
    font-family: var(--app-font-display);
    font-size: 20px;
    font-weight: 900;
    color: var(--app-color-primary-deep);
  }

  span {
    font-size: 11px;
    color: var(--app-color-text-secondary);
  }
}

.me__menu {
  margin-top: 12px;
  padding: 4px 0;
}

.me__row {
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
  padding: 12px 16px;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: var(--app-radius);

  & + & {
    border-top: 1px solid var(--app-color-line);
  }

  &:active {
    background: rgb(228 104 31 / 6%);
  }
}

.me__row-icon {
  flex: none;
  font-size: 18px;
  color: var(--app-color-primary-deep);
}

.me__row-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.me__row-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-color-text);
}

.me__row-label {
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-color-text-muted);
}

.me__row-value {
  flex: none;
  font-size: 13px;
  color: var(--app-color-text-secondary);
}

.me__row-arrow {
  flex: none;
  color: var(--app-color-text-muted);
}

.me__actions {
  margin-top: 24px;
}

.me__delete {
  display: block;
  width: 100%;
  margin-top: 16px;
  font-size: 12px;
  color: var(--app-color-text-muted);
  text-decoration: underline;
  cursor: pointer;
  background: none;
  border: none;
}

.me__delete-tip {
  margin: 8px 16px 16px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--app-color-text-secondary);

  &--loading {
    margin-top: 0;
    color: var(--app-color-primary);
  }
}

.me__guest-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 24px;
}
</style>
