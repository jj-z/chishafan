import type { MaybeRefOrGetter } from 'vue'

// 统一的页面 SEO（P2-22）：标题、描述与 Open Graph。
// 所有页面都从这里设置 <head>，避免出现「分享出去只有链接没有标题」的情况。
// 标题/描述支持传函数，详情页可以等数据加载完再更新（SSR 首屏则用兜底文案）。

const SITE_NAME = '吃啥饭'
const DEFAULT_DESCRIPTION =
  '按口味、天气和就餐场景随机推荐吃啥饭，支持早中晚三餐、组合餐与 AI 对话选菜。'

interface PageSeoOptions {
  title: MaybeRefOrGetter<string>
  description?: MaybeRefOrGetter<string | undefined>
  /** 详情页传菜图，分享卡片才有封面。 */
  image?: MaybeRefOrGetter<string | undefined>
}

export function usePageSeo(options: PageSeoOptions) {
  // og:image 必须是绝对地址：微信/飞书抓取分享卡片时不会自动补域名。
  // 站内图片存的是 /uploads/… 或 /dishes/… 相对路径，这里先在 setup 阶段取一次 origin，
  // 再在 getter 里拼绝对 URL。不能把 useRequestURL 放进 getter：那时已脱离 setup 上下文。
  const origin = useRequestURL().origin

  useHead(() => {
    const title = toValue(options.title)
    const description = toValue(options.description) || DEFAULT_DESCRIPTION
    const image = toValue(options.image)
    const fullTitle = `${title} · ${SITE_NAME}`

    // 外链直接透传；非法地址不生成 og:image，宁可没有封面也不要输出坏链接
    let absoluteImage: string | null = null
    if (image) {
      try {
        absoluteImage = new URL(image, origin).href
      } catch {
        absoluteImage = null
      }
    }

    return {
      title: fullTitle,
      meta: [
        { name: 'description', content: description },
        // Open Graph：微信/飞书等分享卡片读取的就是这几项。
        { property: 'og:title', content: fullTitle },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: SITE_NAME },
        ...(absoluteImage ? [{ property: 'og:image', content: absoluteImage }] : []),
      ],
    }
  })
}
