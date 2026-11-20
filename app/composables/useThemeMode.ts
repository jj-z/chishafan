/**
 * 主题模式：light（明亮）/ dark（暗夜）/ auto（跟随系统）。
 *
 * 与 useHistoryDays 同款思路：useState 跨页共享 + localStorage 持久化，
 * 设置放「我的」页，全局在 app.vue 消费。主题色不做自定义（等设计图），
 * 这里只管明暗——明暗由 Vant 深色主题变量 + 全局 --app-* 变量两层覆盖实现。
 *
 * SSR 说明：prefers-color-scheme 只在客户端可知，服务端一律按 light 渲染；
 * auto 且系统为 dark 时会在挂载瞬间切到深色，闪一下可接受，不做服务端探测。
 */

export type ThemeMode = 'light' | 'dark' | 'auto'

const STORAGE_KEY = 'app-theme-mode'
const VALID_MODES: ThemeMode[] = ['light', 'dark', 'auto']

export function useThemeMode() {
  const themeMode = useState<ThemeMode>(STORAGE_KEY, () => 'auto')

  /**
   * 系统是否处于深色。初始 false（SSR 安全），挂载后同步真实值并监听变化——
   * 用户在系统设置里切换深浅色时，auto 模式下页面要跟着变。
   */
  const systemDark = ref(false)
  /** 实际生效的明暗：dark 恒深；auto 看系统；light 恒浅。 */
  const isDark = computed(
    () => themeMode.value === 'dark' || (themeMode.value === 'auto' && systemDark.value),
  )

  onMounted(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    systemDark.value = media.matches
    // 只监听变化事件，change 回调里同步 ref；compasable 生命周期跟随组件自动解绑
    media.addEventListener('change', (e) => {
      systemDark.value = e.matches
    })

    const saved = localStorage.getItem(STORAGE_KEY)
    if (VALID_MODES.includes(saved as ThemeMode)) themeMode.value = saved as ThemeMode
  })

  watch(themeMode, (value) => {
    localStorage.setItem(STORAGE_KEY, value)
  })

  return { themeMode, isDark }
}
