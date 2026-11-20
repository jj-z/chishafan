<script setup lang="ts">
import type { DishDetail } from '#shared/schemas/dish'
import type { AiQuota, RecommendEvent } from '#shared/schemas/recommend'

// AI 智能问答聊天页（P1 阶段四第 21 项）。
// 接口是 POST + SSE 流式响应：浏览器原生 EventSource 只支持 GET 且不能带请求体，
// 所以这里用原生 fetch + ReadableStream 手动读流（$fetch 会把响应整个缓冲完才返回，
// 拿不到逐块数据），按 `data: {json}` 事件驱动「打字机」效果。
// 对话存在 useState 里：切去别的页面再回来不清空，刷新页面才重置。

usePageSeo({
  title: 'AI 选菜',
  description: '把口味、预算、忌口告诉 AI，让它直接从菜品库里帮你挑一餐。',
})

interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  text: string
  /** result 事件后由服务端回查组装的真实菜品卡片（REC-02），错误消息没有。 */
  dishes?: DishDetail[]
  /** 环境提示（城市/天气/是否应用偏好），跟随机推荐首页同一份语义。 */
  meta?: string
  /** 工具执行状态，例如「正在查天气…」「已完成：上海 晴 21℃」。 */
  toolStatus?: string
  /** 本轮是否命中知识库；false 且 knowledgeMiss=true 时提示「未找到依据」。 */
  grounded?: boolean
  knowledgeMiss?: boolean
  /** 单条消息上的赞/踩结果，键为 dishId。 */
  feedback?: Record<string, 'LIKE' | 'DISLIKE'>
  /** error=true 的气泡按警告样式渲染，且不进入下一轮对话历史。 */
  error?: boolean
  /** 这一餐的搭配说明，例如「主菜 + 配菜 + 汤，主食：米饭」。 */
  mealLabel?: string
  /** 是否仍在逐字打印：用于显示光标，并让打字机节奏可见。 */
  typing?: boolean
}

const messages = useState<ChatMessage[]>('chat-messages', () => [])
const input = ref('')
const streaming = ref(false)
/** 今日 token 额度，来自服务端 quota 事件；null 表示本轮还没拿到。 */
const quota = ref<AiQuota | null>(null)
/** 额度预警只提示一次，避免每次调用都弹 toast 打扰用户。 */
let quotaWarned = false
const listRef = ref<HTMLElement | null>(null)
const router = useRouter()
// AI 推荐结果的曝光埋点；点击由 DishCard 传 track-source 上报（TRACK-01）。
const { trackImpressions } = useRecommendTracking()

// id 必须单调递增：useState 里可能还留着上一次离开页面时的消息，
// 组件重新 setup 时从现有最大 id 继续，避免 key 冲突。
let msgSeq = messages.value.reduce((max, m) => Math.max(max, m.id), 0)

const suggestions = [
  '今天想吃点辣的',
  '来一餐清爽的搭配',
  '预算 30 以内吃什么',
  '现在几点，适合吃啥',
  '今天天气怎么样',
  '不想吃米饭，换点主食',
]

/** 工具名 → 中文动作，用于「正在…」的状态提示。 */
const TOOL_LABELS: Record<string, string> = {
  get_current_time: '查时间',
  get_weather: '查天气',
  recommend_dishes: '挑菜',
  search_knowledge: '查菜品库',
  record_feedback: '记录偏好',
}

function scrollBottom() {
  nextTick(() => {
    listRef.value?.scrollTo({ top: listRef.value.scrollHeight, behavior: 'smooth' })
  })
}

// ===== 打字机效果 =====
// 上游 SSE 的 chunk 大小与间隔都不稳定，直接追加会出现「一下蹦半屏」的观感。
// 这里把收到的文本先放入队列，再由定时器按固定节奏吐字；队列越长单次吐字越多，
// 保证整体耗时不随网络抖动明显拉长（24ms 一帧接近人眼感知的平滑下限）。
const pendingText = new Map<number, string>()
let typeTimer: ReturnType<typeof setInterval> | null = null

/** 启动吐字定时器；已有定时器时直接复用，避免多个消息各起一个计时器。 */
function startTyping() {
  if (typeTimer) return
  typeTimer = setInterval(() => {
    let active = false
    for (const msg of messages.value) {
      const pending = pendingText.get(msg.id)
      if (!pending) continue
      active = true
      const step = Math.max(1, Math.ceil(pending.length / 12))
      msg.text += pending.slice(0, step)
      const rest = pending.slice(step)
      if (rest) {
        pendingText.set(msg.id, rest)
      } else {
        pendingText.delete(msg.id)
        msg.typing = false
      }
    }
    if (active) scrollBottom()
    if (!pendingText.size && typeTimer) {
      clearInterval(typeTimer)
      typeTimer = null
    }
  }, 24)
}

/** 收尾时把队列里剩余的字一次性补上，避免流结束后气泡还差一截。 */
function flushTyping() {
  for (const [id, rest] of pendingText) {
    const msg = messages.value.find((item) => item.id === id)
    if (msg) {
      msg.text += rest
      msg.typing = false
    }
  }
  pendingText.clear()
  if (typeTimer) {
    clearInterval(typeTimer)
    typeTimer = null
  }
}

/** 把 result 事件里的环境上下文拼成气泡底部的一行小字，与首页环境提示口径一致。 */
function buildMeta(evt: Extract<RecommendEvent, { type: 'result' }>): string {
  const parts: string[] = []
  if (evt.ambient.city) parts.push(evt.ambient.city)
  if (evt.ambient.weather) parts.push(`${evt.ambient.weather.text} ${evt.ambient.weather.tempC}℃`)
  if (evt.preferenceApplied) parts.push('已按口味偏好')
  return parts.join(' · ')
}

/** 更新额度并在剩余不足 10% 时提示一次；服务端每次模型调用后都会推 quota 事件。 */
function applyQuota(next: AiQuota) {
  quota.value = next
  if (!quotaWarned && next.remaining <= Math.max(1, Math.floor(next.limit * 0.1))) {
    quotaWarned = true
    showToast('今日 AI 额度快用完了')
  }
}

/**
 * 对推荐结果点赞/点踩（PREF-12）。
 * 失败不影响聊天主流程：401 提示登录，其余错误提示稍后再试。
 */
async function sendFeedback(msg: ChatMessage, dishId: string, action: 'LIKE' | 'DISLIKE') {
  try {
    await $fetch('/api/feedback', { method: 'POST', body: { dishId, action } })
    msg.feedback = { ...(msg.feedback ?? {}), [dishId]: action }
    showToast(action === 'LIKE' ? '已记下，会多推荐类似口味' : '已记下，近期不再推荐')
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode
    showToast(status === 401 ? '登录后才能记录偏好' : '记录失败，请稍后再试')
  }
}

async function send(preset?: string) {
  const content = (preset ?? input.value).trim()
  if (!content || streaming.value) return
  // 无论手输还是点推荐话术，内容上屏后输入框都清空。
  input.value = ''
  streaming.value = true

  // 用户气泡立即上屏；assistant 先占一个空气泡，流式增量往里追加。
  messages.value.push({ id: ++msgSeq, role: 'user', text: content })
  const reply: ChatMessage = { id: ++msgSeq, role: 'assistant', text: '' }
  messages.value.push(reply)
  scrollBottom()

  try {
    // 多轮对话历史：本轮之前的所有非错误消息，保留最近 5 轮 10 条（与服务端一致）。
    const history = messages.value
      .slice(0, -2)
      .filter((m) => !m.error && m.text)
      .map((m) => ({ role: m.role, content: m.text.slice(0, 300) }))
      .slice(-10)

    const res = await fetch('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: content, history }),
    })
    // HTTP 层错误（参数校验 400、未预期 500）：读出 body 里的 message 直接展示。
    if (!res.ok || !res.body) {
      const data = (await res.json().catch(() => null)) as { message?: string } | null
      throw new Error(data?.message || '请求失败，请稍后再试')
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let streamError = ''

    // SSE 事件以空行分隔；网络分块的边界可能把事件切成两半，
    // 统一先攒进 buffer、按空行切段，最后一段留给下一轮拼接。
    const handleChunk = (chunk: string) => {
      buffer += chunk
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''
      for (const part of parts) {
        const line = part.trim()
        if (!line.startsWith('data:')) continue
        try {
          const evt = JSON.parse(line.slice(5).trim()) as RecommendEvent
          if (evt.type === 'delta') {
            pendingText.set(reply.id, (pendingText.get(reply.id) ?? '') + evt.text)
            reply.typing = true
            startTyping()
          } else if (evt.type === 'tool') {
            const label = TOOL_LABELS[evt.name] ?? evt.name
            reply.toolStatus =
              evt.status === 'start'
                ? `正在${label}…`
                : evt.status === 'ok'
                  ? `已完成：${evt.message ?? label}`
                  : `未完成：${evt.message ?? label}`
            scrollBottom()
          } else if (evt.type === 'quota') {
            applyQuota({ used: evt.used, limit: evt.limit, remaining: evt.remaining })
          } else if (evt.type === 'result') {
            // result 的 text 是服务端剥掉菜品标记后的完整正文。
            // 已打印出来的部分不重排，只把剩余部分入队，避免文字闪回。
            if (evt.text.startsWith(reply.text)) {
              const rest = evt.text.slice(reply.text.length)
              if (rest) pendingText.set(reply.id, rest)
            } else {
              reply.text = ''
              pendingText.set(reply.id, evt.text)
            }
            reply.typing = Boolean(pendingText.get(reply.id))
            startTyping()
            reply.dishes = evt.dishes
            reply.mealLabel = evt.mealLabel
            reply.meta = buildMeta(evt)
            reply.grounded = evt.grounded
            reply.knowledgeMiss = evt.knowledgeMiss
            applyQuota(evt.quota)
            // 只有真正带菜品的结果气泡才算 AI 曝光；纯聊天回复与错误气泡不埋（TRACK-01）。
            if (evt.dishes.length)
              trackImpressions(
                evt.dishes.map((d) => d.id),
                'AI',
              )
            scrollBottom()
          } else {
            streamError = evt.message
          }
        } catch {
          // 单个事件解析失败就跳过，不影响其余事件。
        }
      }
    }

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      handleChunk(decoder.decode(value, { stream: true }))
    }
    handleChunk(buffer)
    // 流结束后把队列里剩余文字补齐，避免气泡少最后一截。
    flushTyping()

    if (streamError) {
      reply.error = true
      reply.text = streamError
    } else if (!reply.text && !reply.dishes?.length) {
      reply.error = true
      reply.text = 'AI 没有返回内容，请再试一次'
    }
  } catch (err: unknown) {
    // 断网、超时、HTTP 错误统一落到错误气泡，页面本身不能崩（acceptance 第 12 条）。
    reply.error = true
    reply.text = (err as Error).message || '请求失败，请稍后再试'
  } finally {
    streaming.value = false
    scrollBottom()
  }
}

function clearChat() {
  if (streaming.value) {
    showToast('AI 正在回复，稍等片刻')
    return
  }
  messages.value = []
  msgSeq = 0
  flushTyping()
}

function goBack() {
  router.back()
}
</script>

<template>
  <div class="chat">
    <van-nav-bar
      title="AI 帮我选"
      left-text="返回"
      left-arrow
      right-icon="delete-o"
      @click-left="goBack"
      @click-right="clearChat"
    />

    <!-- 今日 token 额度：服务端每次模型调用后推送，剩余不足一成时变红提醒 -->
    <div
      v-if="quota"
      class="chat__quota"
      :class="{ 'chat__quota--low': quota.remaining <= Math.floor(quota.limit * 0.1) }"
    >
      今日 AI 额度剩余 {{ quota.remaining }} / {{ quota.limit }}
    </div>

    <div ref="listRef" class="chat__list">
      <!-- 空态不用 van-empty：设计稿是「衬线引导语 + 快捷提问」的居中排布，
           van-empty 的插画和灰字描述会破坏纸张质感。 -->
      <div v-if="!messages.length" class="chat__empty">
        <p class="chat__empty-title">说说你想吃点什么</p>
        <p class="chat__empty-sub">我从菜品库里帮你挑</p>
        <!-- 点击后调用页面原有的 send()，走同一条 SSE 请求链路，不另写请求。 -->
        <div class="chat__suggestions">
          <button
            v-for="s in suggestions"
            :key="s"
            type="button"
            class="app-chip app-chip--primary chat__chip"
            @click="send(s)"
          >
            {{ s }}
          </button>
        </div>
      </div>

      <div
        v-for="msg in messages"
        :key="msg.id"
        class="chat__row"
        :class="`chat__row--${msg.role}`"
      >
        <div
          class="chat__bubble"
          :class="[
            msg.role === 'user' ? 'chat__bubble--user' : 'chat__bubble--ai',
            {
              'app-card': msg.role === 'assistant' && !msg.error,
              'chat__bubble--error': msg.error,
            },
          ]"
        >
          <p v-if="msg.toolStatus" class="chat__tool">{{ msg.toolStatus }}</p>
          <p v-if="msg.text" class="chat__text">
            {{ msg.text }}<span v-if="msg.typing" class="chat__cursor" />
          </p>
          <p v-else-if="msg.role === 'assistant'" class="chat__text chat__text--typing">
            正在思考<span class="chat__cursor" />
          </p>

          <!-- 检索未命中：明确告诉用户知识库没有依据，而不是让用户以为回复有出处 -->
          <p v-if="msg.knowledgeMiss" class="chat__miss">菜品库里没有找到相关依据</p>

          <!-- 这一餐的搭配结构：让用户看到「主食 + 主菜 + 配菜」而不是零散几张卡 -->
          <p v-if="msg.mealLabel" class="chat__meal">这一餐：{{ msg.mealLabel }}</p>

          <div v-if="msg.dishes?.length" class="chat__dishes">
            <DishCard v-for="dish in msg.dishes" :key="dish.id" :dish="dish" track-source="AI" />
          </div>

          <!-- 赞/踩：只有带菜品的推荐气泡才需要反馈（PREF-12），游客点击会提示登录 -->
          <div v-if="msg.dishes?.length && !msg.error" class="chat__feedback">
            <div v-for="dish in msg.dishes" :key="dish.id" class="chat__feedback-row">
              <span class="chat__feedback-name">{{ dish.name }}</span>
              <button
                type="button"
                class="chat__feedback-btn"
                :class="{ 'is-active': msg.feedback?.[dish.id] === 'LIKE' }"
                @click="sendFeedback(msg, dish.id, 'LIKE')"
              >
                喜欢
              </button>
              <button
                type="button"
                class="chat__feedback-btn"
                :class="{ 'is-active': msg.feedback?.[dish.id] === 'DISLIKE' }"
                @click="sendFeedback(msg, dish.id, 'DISLIKE')"
              >
                不喜欢
              </button>
            </div>
          </div>

          <p v-if="msg.meta" class="chat__meta">{{ msg.meta }}</p>
        </div>
      </div>
    </div>

    <div class="chat__input">
      <van-field
        v-model="input"
        placeholder="想吃点什么？"
        maxlength="200"
        :disabled="streaming"
        @keyup.enter="send()"
      />
      <van-button
        type="primary"
        class="app-btn app-btn--solid chat__send"
        :disabled="streaming || !input.trim()"
        :loading="streaming"
        @click="send()"
      >
        发送
      </van-button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.chat {
  display: flex;
  flex-direction: column;
  // 用视口高度撑满整屏；dvh 会在移动端地址栏收起时跟着变化，比 vh 更贴合可视区。
  // 底部输入区自己承担安全区内边距，所以这里不再扣减 env()，否则会少算一截。
  height: 100vh;
  height: 100dvh;

  &__list {
    flex: 1;
    overflow-y: auto;
    padding: 14px;
  }

  // 额度条贴在导航栏下方：不参与消息滚动，用户任何时刻都能看到剩余额度
  &__quota {
    flex: none;
    padding: 5px 14px;
    font-size: 11px;
    text-align: center;
    color: var(--app-color-text-secondary);
    background: color-mix(in srgb, var(--app-color-surface-strong) 70%, transparent);
    border-bottom: 1px solid var(--app-color-line);

    &--low {
      color: var(--app-color-danger);
    }
  }

  // 空态占满消息区并居中，让引导语落在视觉重心上，而不是顶在导航栏下面。
  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100%;
    padding: 24px 12px 40px;
    text-align: center;
  }

  &__empty-title {
    margin: 0;
    font-family: var(--app-font-display);
    font-size: 22px;
    font-weight: 900;
    line-height: 1.4;
    letter-spacing: 0.02em;
    color: var(--app-color-text);
  }

  &__empty-sub {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--app-color-text-secondary);
  }

  &__row {
    display: flex;
    margin-bottom: 14px;

    &--user {
      justify-content: flex-end;
    }

    &--assistant {
      justify-content: flex-start;
    }
  }

  // 气泡圆角朝「说话人」一侧收尖：用户右下、AI 左上用小圆角。
  // 这样不用头像也能一眼分清双方，同时保持整体的大圆角纸片感。
  &__bubble {
    max-width: 80%;
    padding: 11px 14px;

    &--ai {
      border-top-left-radius: 4px;
    }

    &--user {
      color: #fff;
      background: linear-gradient(180deg, #f5821f, #e4610f);
      border: 1px solid transparent;
      border-radius: var(--app-radius) var(--app-radius) 4px var(--app-radius);
      box-shadow: var(--app-shadow-card);

      .chat__meta {
        color: rgb(255 255 255 / 78%);
      }
    }

    // 错误气泡：用 danger 令牌混合卡片底色，亮/暗模式都会自动得到合适的浅红/深红。
    &--error {
      background: color-mix(in srgb, var(--app-color-danger) 10%, var(--app-color-surface));
      border: 1px solid color-mix(in srgb, var(--app-color-danger) 40%, transparent);
      border-radius: var(--app-radius);

      .chat__text {
        color: var(--app-color-danger);
      }
    }
  }

  &__text {
    margin: 0;
    font-size: 14px;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;

    &--typing {
      color: var(--app-color-text-secondary);
    }
  }

  // 打字机占位光标：流式输出前给用户「正在生成」的视觉反馈。
  &__cursor {
    display: inline-block;
    width: 2px;
    height: 14px;
    margin-left: 4px;
    vertical-align: -2px;
    background: var(--app-color-primary);
    animation: chat-blink 1s step-end infinite;
  }

  &__dishes {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 10px;
  }

  // 工具执行状态：轻量灰字，不抢正文视觉，但能解释「为什么等了一会儿」
  &__tool {
    margin: 0 0 6px;
    font-size: 12px;
    color: var(--app-color-text-muted);
  }

  // 搭配说明：用主色细线引出，强调这是「一餐」而不是单品堆叠
  &__meal {
    margin: 10px 0 0;
    padding-left: 8px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--app-color-primary-deep);
    border-left: 3px solid color-mix(in srgb, var(--app-color-primary) 55%, transparent);
  }

  // 检索未命中提示：用危险色，与「有依据的回答」区分开
  &__miss {
    margin: 8px 0 0;
    font-size: 11px;
    color: var(--app-color-danger);
  }

  &__feedback {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px dashed var(--app-color-line);
  }

  &__feedback-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }

  &__feedback-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--app-color-text-secondary);
  }

  &__feedback-btn {
    flex: none;
    padding: 3px 10px;
    font-size: 11px;
    color: var(--app-color-text-secondary);
    cursor: pointer;
    background: var(--app-color-surface-strong);
    border: 1px solid var(--app-color-line);
    border-radius: var(--app-radius-pill);

    &.is-active {
      color: var(--app-color-primary-deep);
      border-color: color-mix(in srgb, var(--app-color-primary) 45%, transparent);
    }
  }

  &__meta {
    margin: 8px 0 0;
    font-size: 11px;
    color: var(--app-color-text-secondary);
  }

  &__suggestions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
    max-width: 340px;
    margin-top: 26px;
  }

  // 快捷提问胶囊：在全局 .app-chip 的小标签基础上放大成可点击按钮。
  // 底色用 color-mix 混合 surface-strong，暗色模式会自动变深，不会留一块亮奶油色。
  &__chip {
    padding: 9px 18px;
    font-family: inherit;
    font-size: 14px;
    line-height: 1.4;
    color: var(--app-color-primary-deep);
    background: color-mix(in srgb, var(--app-color-surface-strong) 70%, transparent);
    border-color: color-mix(in srgb, var(--app-color-primary) 45%, transparent);
    border-radius: var(--app-radius-pill);
    cursor: pointer;
    transition: transform 0.12s ease;

    &:active {
      transform: scale(0.96);
    }
  }

  // 输入区：半透明奶油底 + 上边框，消息滚到底时不会出现生硬的分界线。
  &__input {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
    background: color-mix(in srgb, var(--app-color-surface) 92%, transparent);
    border-top: 1px solid var(--app-color-line);
    backdrop-filter: blur(8px);

    :deep(.van-field) {
      flex: 1;
      min-width: 0;
      padding: 8px 16px;
      background: var(--app-color-surface-strong);
      border: 1px solid var(--app-color-line);
      border-radius: var(--app-radius-pill);
      box-shadow: var(--app-shadow-inner);
    }

    // 去掉 Vant 用 ::after 画的 1px 分隔线
    :deep(.van-field::after) {
      display: none;
    }

    :deep(.van-field__control) {
      font-size: 14px;
      color: var(--app-color-text);
    }

    :deep(.van-field__control::placeholder) {
      color: var(--app-color-text-muted);
    }
  }

  // 发送按钮比通用按钮矮一档，和胶囊输入框视觉等高
  &__send {
    flex: none;
    height: 38px;
    padding: 0 20px;
    font-size: 14px;
  }
}

@keyframes chat-blink {
  50% {
    opacity: 0;
  }
}
</style>
