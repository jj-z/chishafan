// server/utils/sms.ts
// 手机号验证码短信通道（AUTH-16）。
//
// 当前项目未接入任何短信服务商（按需求先走「开发模式验证码」）：
// 本函数永远返回 { sent: false }，由调用方决定开发环境回传 devCode、生产环境返回 503。
// 以后接入阿里云/腾讯云短信时只改本文件，接口层不感知供应商——与 mail.ts 保持同一模式，
// 也避免在业务接口里直接 fetch 第三方短信服务。

/**
 * 发送 6 位数字验证码。
 * 返回 `{ sent: false }` 表示没有可用的短信通道（当前即如此）；
 * 真正接入供应商后，这里的失败应抛出异常，由接口统一转 503。
 */
export async function sendVerificationCode(
  _phone: string,
  _code: string,
): Promise<{ sent: boolean }> {
  return { sent: false }
}
