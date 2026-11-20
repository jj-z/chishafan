// Embedding 客户端（D2）：知识库向量化用，走 OpenAI 兼容的 /embeddings 协议。
//
// 设计约束：
// 1. 不引入 SDK：请求体与响应结构都很简单（input → data[].embedding），
//    原生 fetch 足够，避免为一个接口增加运行时依赖；
// 2. 失败必须抛中文错误，由调用方决定降级（检索降级为关键词、后台同步只告警）；
// 3. 维度校验放在客户端：模型不支持指定维度时会静默返回默认维度（如 2048），
//    如果不校验，写库时才会因 vector(1024) 报一个难以定位的 SQL 错误。

/** 智谱 embedding 单次最多 64 条，超过必须分批，否则整批失败。 */
const MAX_BATCH = 64
const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_DIMENSIONS = 1024

export interface EmbeddingConfig {
  url: string
  apiKey: string
  model: string
  /** 向量维度，必须与 knowledge_chunks.embedding vector(N) 完全一致。 */
  dimensions: number
  timeoutMs: number
}

/**
 * 环境变量是否配了 Key。
 * 未配置时检索自动降级为关键词匹配，后台同步跳过向量化，因此不能直接抛错。
 */
export function isEmbeddingConfigured(): boolean {
  return !!process.env.NUXT_EMBEDDING_API_KEY?.trim()
}

/**
 * 把 baseURL 归一成 embeddings 端点。
 * 允许两种写法：只写 `/api/paas/v4` 或直接写完整 `.../embeddings`，
 * 避免像 LLM 那样因为少写路径而 404。
 */
function resolveEmbeddingsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '')
  return /\/embeddings$/i.test(trimmed) ? trimmed : `${trimmed}/embeddings`
}

/** 读取维度配置；非法值回退默认 1024，避免写错环境变量导致整条链路不可用。 */
function resolveDimensions(raw: string | undefined): number {
  const value = raw ? Number.parseInt(raw, 10) : Number.NaN
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_DIMENSIONS
}

/**
 * 读取 embedding 配置。未配置 Key 时抛错，供「明确要求向量化」的调用方使用；
 * 希望降级的调用方先用 isEmbeddingConfigured() 判断。
 */
export function getEmbeddingConfig(): EmbeddingConfig {
  const apiKey = process.env.NUXT_EMBEDDING_API_KEY?.trim() ?? ''
  if (!apiKey) {
    throw new Error('知识库向量化未配置：请在服务端 .env 中填写 NUXT_EMBEDDING_API_KEY')
  }

  const baseUrl =
    process.env.NUXT_EMBEDDING_BASE_URL?.trim() || 'https://open.bigmodel.cn/api/paas/v4'
  const model = process.env.NUXT_EMBEDDING_MODEL?.trim() || 'embedding-3'

  return {
    url: resolveEmbeddingsUrl(baseUrl),
    apiKey,
    model,
    dimensions: resolveDimensions(process.env.NUXT_EMBEDDING_DIMENSIONS),
    timeoutMs: DEFAULT_TIMEOUT_MS,
  }
}

interface EmbeddingResponse {
  data?: Array<{ embedding?: number[]; index?: number }>
}

/** 把上游错误翻译成中文；401/403 单独提示，避免被当成「网络问题」重试。 */
function normalizeEmbeddingError(status: number, body: string): Error {
  console.error(`[embedding] 上游返回 ${status}: ${body.slice(0, 300)}`)
  if (status === 401 || status === 403) {
    return new Error('向量服务鉴权失败，请检查 NUXT_EMBEDDING_API_KEY 是否有效')
  }
  if (status === 429) return new Error('向量服务请求太频繁了，稍后再试')
  if (status >= 500) return new Error('向量服务暂时不可用，稍后再试')
  return new Error('向量服务拒绝了这次请求')
}

/** 单批请求；按 index 还原顺序，上游不保证返回顺序与输入一致。 */
async function embedBatch(config: EmbeddingConfig, texts: string[]): Promise<number[][]> {
  const signal = AbortSignal.timeout(config.timeoutMs)

  let res: Response
  try {
    res = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        input: texts,
        // 智谱 embedding-3 支持该参数；不支持时上游会忽略并返回默认维度，
        // 下面的长度校验会立刻暴露出来，而不是等到写库才报错。
        dimensions: config.dimensions,
      }),
      signal,
    })
  } catch (err) {
    if ((err as Error).name === 'TimeoutError') {
      throw new Error('向量服务响应超时了，请稍后再试', { cause: err })
    }
    throw new Error('连接向量服务失败，请检查网络或稍后再试', { cause: err })
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw normalizeEmbeddingError(res.status, body)
  }

  const data = (await res.json()) as EmbeddingResponse
  const items = data.data ?? []
  if (items.length !== texts.length) {
    throw new Error(`向量服务返回数量不符：期望 ${texts.length}，实际 ${items.length}`)
  }

  // index 缺失时按数组顺序兜底（部分兼容实现不返回 index）。
  const sorted = items.every((item) => typeof item.index === 'number')
    ? [...items].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    : items

  return sorted.map((item) => {
    const vector = item.embedding
    if (!Array.isArray(vector) || vector.length !== config.dimensions) {
      throw new Error(
        `向量维度不符：期望 ${config.dimensions} 维，实际 ${vector?.length ?? 0} 维。` +
          '请确认 NUXT_EMBEDDING_MODEL 与 NUXT_EMBEDDING_DIMENSIONS 是否匹配',
      )
    }
    return vector
  })
}

/**
 * 批量向量化。输入顺序与返回顺序一一对应。
 * 单个批次失败不自动重试第二次以上：知识库同步可以下次再补，检索则直接降级，
 * 在这里无限重试只会拖长用户等待。
 */
export async function embedTexts(
  texts: string[],
  config = getEmbeddingConfig(),
): Promise<number[][]> {
  const result: number[][] = []
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const batch = texts.slice(i, i + MAX_BATCH)
    result.push(...(await embedBatch(config, batch)))
  }
  return result
}

/** 单条向量化的便捷包装，检索时用。 */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text])
  if (!vector) throw new Error('向量服务没有返回结果')
  return vector
}

/** 把数字数组转成 pgvector 字面量，供 raw SQL 里 `$1::vector` 使用。 */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`
}
