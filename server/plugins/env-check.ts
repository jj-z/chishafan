// 启动时环境变量校验（P2-18）。
// 目的：把「上线才发现少了 Key」提前到进程启动阶段。
// 必填项缺失时生产环境直接抛错（容器会重启并明显失败），开发环境只告警，
// 以免新同学 clone 后没配 .env 连开发服务器都起不来。

/** 不配就无法工作的变量。 */
const REQUIRED_ENVS = ['DATABASE_URL', 'NUXT_APP_SECRET'] as const

/** 成组出现的可选能力：要么全配，要么全不配。 */
const OPTIONAL_GROUPS: Array<{ name: string; keys: string[]; hint: string }> = [
  {
    name: 'LLM 推荐',
    keys: ['NUXT_LLM_BASE_URL', 'NUXT_LLM_MODEL', 'NUXT_LLM_API_KEY'],
    hint: '未配置时 AI 推荐会提示「未配置」，随机推荐不受影响。',
  },
  {
    name: '邮件服务（Resend）',
    keys: ['NUXT_RESEND_API_KEY', 'NUXT_MAIL_FROM', 'NUXT_APP_URL'],
    hint: '未配置时找回密码/邮箱换绑在生产环境返回 503。',
  },
  {
    name: '知识库向量化',
    keys: ['NUXT_EMBEDDING_BASE_URL', 'NUXT_EMBEDDING_MODEL', 'NUXT_EMBEDDING_API_KEY'],
    hint: '未配置时知识库检索自动降级为关键词匹配，后台同步跳过向量化。',
  },
]

export default defineNitroPlugin(() => {
  const isDev = import.meta.dev
  const problems: string[] = []

  for (const key of REQUIRED_ENVS) {
    if (!process.env[key]) problems.push(`${key} 未配置`)
  }

  const secret = process.env.NUXT_APP_SECRET
  if (secret && secret.length < 32) {
    problems.push('NUXT_APP_SECRET 长度不足 32 字符（AUTH-06）')
  }

  if (problems.length) {
    const message = `环境变量校验失败：${problems.join('；')}`
    if (isDev) console.warn(`[env] ${message}`)
    else throw new Error(message)
  }

  for (const group of OPTIONAL_GROUPS) {
    const configured = group.keys.filter((key) => !!process.env[key])
    if (configured.length === 0) continue
    if (configured.length !== group.keys.length) {
      // 部分配置比完全不配更危险（例如只配了 Key 没配 baseURL），必须显式提醒。
      const missing = group.keys.filter((key) => !process.env[key])
      console.warn(`[env] ${group.name} 配置不完整，缺少：${missing.join(', ')}。${group.hint}`)
    }
  }
})
