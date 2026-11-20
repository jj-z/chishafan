<script setup lang="ts">
// 个人资料页（AUTH-07~11 / AUTH-15 / AUTH-16）：
// - 昵称可直接改；邮箱与手机号都是登录凭证，修改时必须同时验证当前密码，
//   并分别通过「邮件确认链接」与「短信验证码」确认后才真正换绑；
// - 修改密码必须先验证当前密码，防止会话被盗后直接改密；
// - 保存资料后刷新会话，让「我的」页头部昵称与邮箱立刻更新。
// 这是从「我的」头部进入的二级页，不加 KeepAlive，每次进入都拉最新资料。

import {
  meOkSchema,
  mePasswordUpdateSchema,
  mePhoneConfirmResultSchema,
  mePhoneConfirmSchema,
  meProfileSchema,
  meProfileUpdateResultSchema,
  meProfileUpdateSchema,
} from '#shared/schemas/me'
import type { MeProfile } from '#shared/schemas/me'

const router = useRouter()
const { session, requireLogin } = useAuth()

usePageSeo({ title: '个人资料', description: '修改昵称、邮箱、手机号与密码。' })

const profile = ref<MeProfile | null>(null)
const ready = ref(false)
const saving = ref(false)
const form = reactive({ nickname: '', phone: '', email: '', currentPassword: '' })

/** 邮箱是否被改动：只有改动时才要求填当前密码，避免「只改昵称」也要输密码。 */
const emailChanged = computed(
  () => form.email.trim().toLowerCase() !== (profile.value?.email ?? '').toLowerCase(),
)

/** 手机号是否被改动（含清空）：与数据库原值比较，口径与服务端一致。 */
const phoneChanged = computed(() => form.phone.trim() !== (profile.value?.phone ?? ''))

/** 任一登录凭证被改动都需要当前密码（AUTH-11 / AUTH-16）。 */
const contactChanged = computed(() => emailChanged.value || phoneChanged.value)

/** 开发环境未配置短信服务时，服务端会把验证码回传，便于本机走完换绑。 */
const devCode = ref<string | null>(null)
const phoneCode = ref('')
const confirmingPhone = ref(false)

const pwd = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })
const pwdSaving = ref(false)

/**
 * 从 $fetch 错误里取服务端中文提示。
 * 手机号冲突（409）、当前密码错误（400）都写在 statusMessage 里，直接展示给用户。
 */
function errorMessage(err: unknown, fallback: string) {
  const e = err as { data?: { statusMessage?: string; message?: string }; statusMessage?: string }
  return e?.data?.statusMessage || e?.data?.message || e?.statusMessage || fallback
}

/** 接口返回的资料回填到页面与表单，保证展示值与数据库一致（服务端会把空串归一成 null）。 */
function fillForm(data: MeProfile) {
  profile.value = data
  form.nickname = data.nickname ?? ''
  form.phone = data.phone ?? ''
  form.email = data.email
  // 密码只在本次提交里用一次，回填时立即清空，避免明文长时间停留在页面内存。
  form.currentPassword = ''
}

onMounted(async () => {
  if (!requireLogin()) return
  try {
    fillForm(await apiFetch('/api/me/profile', meProfileSchema))
  } catch (err: unknown) {
    showToast(errorMessage(err, '加载资料失败'))
  } finally {
    ready.value = true
  }
})

async function saveProfile() {
  if (saving.value) return

  // 改邮箱/手机号时才提交 currentPassword：服务端只有检测到登录凭证变化才要求验证密码
  // （AUTH-11 / AUTH-16），这里保持同样口径，避免「只改昵称」被要求输密码。
  const payload: {
    nickname: string
    phone: string
    email?: string
    currentPassword?: string
  } = { nickname: form.nickname, phone: form.phone }
  // 先记下「本次改了什么」：保存成功后 fillForm 会把表单回填成服务端值，
  // 届时 emailChanged / phoneChanged 都会变回 false，不能再拿它们判断本次请求做了什么。
  const requestedEmailChange = emailChanged.value
  const requestedPhoneChange = phoneChanged.value
  if (requestedEmailChange) payload.email = form.email
  if (requestedEmailChange || requestedPhoneChange) payload.currentPassword = form.currentPassword

  // 提交前先用同一份 schema 校验，避免把明显不合法的值发给服务端。
  const parsed = meProfileUpdateSchema.safeParse(payload)
  if (!parsed.success) {
    showToast(parsed.error.issues[0]?.message ?? '请检查输入')
    return
  }
  saving.value = true
  try {
    const result = await apiFetch('/api/me/profile', meProfileUpdateResultSchema, {
      method: 'PATCH',
      body: parsed.data,
    })
    fillForm(result)
    // 昵称与邮箱都存在会话里：不刷新会话，「我的」页头部会一直显示旧值（AUTH-10）。
    await session.fetch()
    // 开发模式验证码只在本次响应里出现，保存下来展示在待确认提示里。
    devCode.value = result.devCode ?? null

    // 只改邮箱且未配置 Resend 时，直接跳到确认页，省去手动从日志里复制链接。
    // 同时改手机号时不跳转，否则会丢失手机验证码的提示。
    if (result.devConfirmUrl && !requestedPhoneChange) {
      const url = new URL(result.devConfirmUrl)
      showToast({ message: '开发模式：已生成确认链接', type: 'success' })
      router.push(`${url.pathname}${url.search}`)
      return
    }

    // 两种换绑都是「先确认后生效」：提示用户完成邮件/短信确认，而不是说已改成功。
    if (requestedPhoneChange && result.pendingPhone) {
      showToast({ message: '验证码已发送至新手机号，请完成确认', type: 'success' })
      return
    }
    if (requestedEmailChange) {
      showToast({ message: '确认邮件已发送至新邮箱，请点击链接完成换绑', type: 'success' })
      return
    }
    showToast({ message: '资料已保存', type: 'success' })
  } catch (err: unknown) {
    showToast(errorMessage(err, '保存失败'))
  } finally {
    saving.value = false
  }
}

/**
 * 提交手机验证码完成换绑（AUTH-16）。
 * 成功后重新拉取资料：phone 与 pendingPhone 都由服务端决定，避免本地拼接出现状态不一致。
 */
async function confirmPhone() {
  if (confirmingPhone.value) return
  const parsed = mePhoneConfirmSchema.safeParse({ code: phoneCode.value })
  if (!parsed.success) {
    showToast(parsed.error.issues[0]?.message ?? '请输入验证码')
    return
  }
  confirmingPhone.value = true
  try {
    await apiFetch('/api/me/phone/confirm', mePhoneConfirmResultSchema, {
      method: 'POST',
      body: parsed.data,
    })
    fillForm(await apiFetch('/api/me/profile', meProfileSchema))
    phoneCode.value = ''
    devCode.value = null
    showToast({ message: '手机号已换绑', type: 'success' })
  } catch (err: unknown) {
    showToast(errorMessage(err, '验证码校验失败'))
  } finally {
    confirmingPhone.value = false
  }
}

async function savePassword() {
  if (pwdSaving.value) return
  const parsed = mePasswordUpdateSchema.safeParse({
    currentPassword: pwd.currentPassword,
    newPassword: pwd.newPassword,
  })
  if (!parsed.success) {
    showToast(parsed.error.issues[0]?.message ?? '请检查输入')
    return
  }
  // 确认密码是前端概念，不进入接口契约，只在这里比对。
  if (pwd.newPassword !== pwd.confirmPassword) {
    showToast('两次新密码不一致')
    return
  }
  pwdSaving.value = true
  try {
    await apiFetch('/api/me/password', meOkSchema, { method: 'PATCH', body: parsed.data })
    // 提交成功立刻清空明文，避免密码长时间留在页面内存里。
    pwd.currentPassword = ''
    pwd.newPassword = ''
    pwd.confirmPassword = ''
    showToast({ message: '密码已修改', type: 'success' })
  } catch (err: unknown) {
    showToast(errorMessage(err, '修改密码失败'))
  } finally {
    pwdSaving.value = false
  }
}
</script>

<template>
  <div class="profile">
    <van-nav-bar title="个人资料" left-text="返回" left-arrow @click-left="router.back()" />

    <div class="profile__body">
      <van-loading
        v-if="!ready"
        class="profile__loading"
        type="spinner"
        color="var(--app-color-primary)"
      />

      <template v-else-if="profile">
        <p class="profile__tip">
          昵称可直接修改；邮箱与手机号是登录凭证，修改时需要验证当前密码，并分别通过邮件链接、短信验证码确认后才会生效。
        </p>

        <van-notice-bar
          v-if="profile.pendingEmail"
          class="profile__pending"
          left-icon="info-o"
          :text="`待确认的新邮箱：${profile.pendingEmail}。请点击邮件里的确认链接完成换绑（30 分钟内有效），确认前原邮箱仍可登录。`"
        />

        <van-notice-bar
          v-if="profile.pendingPhone"
          class="profile__pending"
          left-icon="info-o"
          :text="`待确认的新手机号：${profile.pendingPhone}。请输入短信验证码完成换绑（5 分钟内有效），确认前原手机号仍可登录。`"
        />

        <van-form class="profile__form" @submit="saveProfile">
          <!-- 每组字段是一张奶油卡片，行之间只用 1px 分割线，不再让 Vant 逐行画线 -->
          <div class="app-card profile__card">
            <van-field
              v-model="form.email"
              name="email"
              label="邮箱"
              placeholder="登录邮箱"
              autocomplete="email"
            />
            <van-field
              v-if="contactChanged"
              v-model="form.currentPassword"
              name="currentPassword"
              type="password"
              label="当前密码"
              placeholder="修改邮箱/手机号需验证当前密码"
              autocomplete="current-password"
            />
            <van-field
              v-model="form.nickname"
              name="nickname"
              label="昵称"
              placeholder="2–20 个字符，可留空"
              maxlength="20"
            />
            <van-field
              v-model="form.phone"
              name="phone"
              label="手机号"
              placeholder="可选；修改时需短信验证"
              maxlength="20"
            />
          </div>
          <div class="profile__actions">
            <van-button block class="app-btn app-btn--solid" native-type="submit" :loading="saving">
              保存资料
            </van-button>
          </div>
        </van-form>

        <van-form v-if="profile.pendingPhone" class="profile__form" @submit="confirmPhone">
          <h2 class="profile__group-title">确认新手机号</h2>
          <div class="app-card profile__card">
            <van-field
              v-model="phoneCode"
              name="code"
              type="digit"
              maxlength="6"
              label="验证码"
              placeholder="请输入 6 位数字验证码"
            />
            <van-field v-if="devCode" readonly label="开发验证码" :model-value="devCode" />
          </div>
          <div class="profile__actions">
            <van-button
              block
              class="app-btn app-btn--solid"
              native-type="submit"
              :loading="confirmingPhone"
            >
              确认换绑
            </van-button>
          </div>
        </van-form>

        <van-form class="profile__form" @submit="savePassword">
          <h2 class="profile__group-title">修改密码</h2>
          <div class="app-card profile__card">
            <van-field
              v-model="pwd.currentPassword"
              name="currentPassword"
              type="password"
              label="当前密码"
              placeholder="必填"
            />
            <van-field
              v-model="pwd.newPassword"
              name="newPassword"
              type="password"
              label="新密码"
              placeholder="至少 8 位"
            />
            <van-field
              v-model="pwd.confirmPassword"
              name="confirmPassword"
              type="password"
              label="确认新密码"
              placeholder="再输一次"
            />
          </div>
          <div class="profile__actions">
            <van-button
              block
              class="app-btn app-btn--outline-neutral"
              native-type="submit"
              :loading="pwdSaving"
            >
              修改密码
            </van-button>
          </div>
        </van-form>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.profile {
  // 整页底色由 .app-shell 提供纸纹，这里只控制内容区留白
  &__body {
    padding: 12px 16px 24px;
  }

  &__loading {
    display: flex;
    justify-content: center;
    margin: 48px 0;
  }

  &__tip {
    margin: 0 2px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--app-color-text-secondary);
  }

  // 待确认提示条改成奶油底 + 细描边，避免 Vant 默认的黄色警示块跳出纸张色系
  &__pending {
    margin-top: 12px;
    padding: 8px 12px;
    color: var(--app-color-text-secondary);
    background: color-mix(in srgb, var(--app-color-primary) 8%, var(--app-color-surface));
    border: 1px solid var(--app-color-line);
    border-radius: var(--app-radius-sm);

    :deep(.van-notice-bar__content) {
      font-size: 12px;
      line-height: 1.6;
    }

    :deep(.van-icon) {
      color: var(--app-color-primary-deep);
    }
  }

  &__form {
    margin-top: 16px;
  }

  // 字段行：label 左、值右，行间只用 1px 分割线，整组共用一张卡片
  &__card {
    overflow: hidden;

    :deep(.van-cell) {
      padding: 14px 16px;
      background: transparent;

      &::after {
        display: none;
      }

      & + .van-cell {
        border-top: 1px solid var(--app-color-line);
      }
    }

    :deep(.van-field__label) {
      width: 5em;
      margin-inline-end: 12px;
      font-size: 14px;
      font-weight: 600;
      color: var(--app-color-text);
      white-space: nowrap;
    }

    :deep(.van-field__control) {
      font-size: 14px;
      color: var(--app-color-text);
      text-align: right;
    }

    :deep(.van-field__control::placeholder) {
      color: var(--app-color-text-muted);
    }

    :deep(.van-field__error-message) {
      font-size: 12px;
    }
  }

  &__group-title {
    margin: 0 0 8px 2px;
    font-family: var(--app-font-display);
    font-size: 16px;
    font-weight: 700;
    line-height: 1.3;
    color: var(--app-color-text);
  }

  &__actions {
    margin-top: 16px;
  }
}
</style>
