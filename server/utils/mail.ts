// server/utils/mail.ts
// 账号相关邮件（AUTH-14 找回密码 / AUTH-15 邮箱换绑）。
//
// 为什么用 Resend HTTP API + 原生 fetch：项目要求不擅自新增依赖，
// Resend 提供 HTTPS 接口即可发信，换取「零依赖 + 换供应商只改一个文件」。
// 接口层只调用导出的两个发送函数，不感知具体邮件服务。

interface MailConfig {
  apiKey: string
  from: string
}

/** 从环境变量读取邮件配置；缺失时由调用方决定走开发兜底还是生产报错。 */
function getMailConfig(): MailConfig {
  return {
    apiKey: process.env.NUXT_RESEND_API_KEY || '',
    from: process.env.NUXT_MAIL_FROM || '',
  }
}

/**
 * 统一的邮件正文骨架。
 * 不引入模板引擎：内容固定、只有一段说明和一个按钮，用内联样式兼容各邮箱客户端。
 * 按钮下方保留纯文本链接，部分客户端会屏蔽按钮样式。
 */
function renderHtml(
  title: string,
  intro: string,
  actionText: string,
  actionUrl: string,
  footer: string,
): string {
  return `
    <div style="max-width:480px;margin:0 auto;padding:24px;font-family:-apple-system,'PingFang SC',sans-serif;color:#333">
      <h2 style="font-size:18px;margin:0 0 16px">${title}</h2>
      <p style="font-size:14px;line-height:1.7;margin:0 0 16px">${intro}</p>
      <p style="margin:0 0 16px">
        <a href="${actionUrl}" style="display:inline-block;padding:10px 20px;background:#ff8917;color:#fff;border-radius:8px;text-decoration:none;font-size:14px">
          ${actionText}
        </a>
      </p>
      <p style="font-size:12px;line-height:1.6;color:#999;margin:0">
        如果按钮无法点击，请复制以下链接到浏览器打开：<br>${actionUrl}<br><br>
        ${footer}
      </p>
    </div>
  `
}

/**
 * 真正发信。返回 `{ sent: false }` 表示没有配置邮件服务，
 * 由调用方决定开发兜底或生产报错；请求失败则抛错。
 */
async function sendMail(to: string, subject: string, html: string): Promise<{ sent: boolean }> {
  const { apiKey, from } = getMailConfig()
  if (!apiKey || !from) return { sent: false }

  await $fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: { from, to, subject, html },
    // 10 秒超时：发信是同步等待的交互，邮件服务卡住时不能把请求挂死。
    timeout: 10_000,
  })

  return { sent: true }
}

/** 找回密码邮件：链接 15 分钟内有效、单次有效。 */
export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
): Promise<{ sent: boolean }> {
  return sendMail(
    to,
    '【吃啥饭】重置密码',
    renderHtml(
      '重置「吃啥饭」密码',
      '我们收到了你的密码重置申请，点击下面的按钮设置新密码。链接 15 分钟内有效，且只能使用一次。',
      '设置新密码',
      resetUrl,
      '如果不是你本人操作，忽略这封邮件即可，密码不会被修改。',
    ),
  )
}

/**
 * 邮箱换绑确认邮件：发到「新邮箱」。
 * 只有能打开这个链接的人才证明拥有新邮箱，确认后账号邮箱才会真正换过去（AUTH-15）。
 */
export async function sendEmailChangeVerificationEmail(
  to: string,
  confirmUrl: string,
): Promise<{ sent: boolean }> {
  return sendMail(
    to,
    '【吃啥饭】确认更换邮箱',
    renderHtml(
      '确认更换邮箱',
      `你正在把「吃啥饭」账号的登录邮箱更换为 ${to}。点击下面的按钮完成确认。链接 30 分钟内有效，且只能使用一次。`,
      '确认更换邮箱',
      confirmUrl,
      '如果不是你本人操作，忽略这封邮件即可；在确认之前，原邮箱仍然可以正常登录。',
    ),
  )
}
