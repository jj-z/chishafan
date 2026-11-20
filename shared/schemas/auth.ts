// 认证相关的请求/响应契约，与 docs/domain.md AUTH-01~06 对齐。

import { z } from 'zod'

/** 登录表单：login 允许邮箱或手机号（服务端按顺序查），先 trim 再去空白。 */
export const loginBodySchema = z.object({
  login: z.string().trim().min(1, '请填写邮箱或手机号'),
  password: z.string().min(1, '请填写密码'),
})

/** 注册表单：邮箱格式、密码至少 8 位（AUTH-04）；手机号/昵称可选，交给服务端归一化空串。 */
export const registerBodySchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, '邮箱格式不正确'),
  password: z.string().min(8, '密码至少 8 位'),
  phone: z.string().trim().optional(),
  nickname: z.string().trim().optional(),
})

/**
 * 会话里暴露给前端的用户信息。
 * 密码哈希绝不进 session：cookie 有 4KB 上限且 session 可能被前端读取。
 */
export const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  nickname: z.string().nullable(),
  role: z.enum(['USER', 'ADMIN']),
})

/** 找回密码申请：只收邮箱；服务端对不存在的邮箱也返回成功，避免被用来探测账号（AUTH-14）。 */
export const forgotPasswordBodySchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, '邮箱格式不正确'),
})

/**
 * 找回密码申请的统一响应。
 * `devResetUrl` 只在开发环境（未配置邮件服务）返回，用于本机验收；
 * 生产环境永远不返回，否则等于把重置凭证直接交给调用方。
 */
export const forgotPasswordOkSchema = z.object({
  ok: z.literal(true),
  devResetUrl: z.string().optional(),
})

/** 重置密码：token 来自邮件链接，密码规则与注册保持一致（至少 8 位）。 */
export const resetPasswordBodySchema = z.object({
  token: z.string().trim().min(1, '重置链接无效'),
  password: z.string().min(8, '密码至少 8 位'),
})

/** 重置密码成功响应。 */
export const resetPasswordOkSchema = z.object({ ok: z.literal(true) })

/** 邮箱换绑确认：token 来自发送到「新邮箱」的确认链接（AUTH-15）。 */
export const confirmEmailBodySchema = z.object({
  token: z.string().trim().min(1, '确认链接无效'),
})

/**
 * 邮箱换绑确认成功响应。
 * 回传换绑后的邮箱，确认页可以直接告诉用户「以后用这个邮箱登录」，不必再查资料接口。
 */
export const confirmEmailOkSchema = z.object({
  ok: z.literal(true),
  email: z.string(),
})

/** 登录/注册成功后的统一响应。 */
export const authOkSchema = z.object({
  ok: z.literal(true),
  user: z.object({
    id: z.string(),
    email: z.string(),
    nickname: z.string().nullable(),
  }),
})

export type LoginBody = z.infer<typeof loginBodySchema>
export type RegisterBody = z.infer<typeof registerBodySchema>
export type SessionUser = z.infer<typeof sessionUserSchema>
export type AuthOk = z.infer<typeof authOkSchema>
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>
export type ConfirmEmailBody = z.infer<typeof confirmEmailBodySchema>
export type ConfirmEmailOk = z.infer<typeof confirmEmailOkSchema>
