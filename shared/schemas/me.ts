// 「我的」相关契约：统计、个人资料读取/修改、修改密码。
// 资料页与 /api/me/* 必须复用这里，禁止在页面或接口里重复声明类型（AUTH-07~10）。

import { z } from 'zod'

/** 我的页顶部统计，收藏数/历史数均来自真实库，登录后才有意义。 */
export const meSummarySchema = z.object({
  nickname: z.string().nullable(),
  email: z.string(),
  favoriteCount: z.number().int().min(0),
  historyCount: z.number().int().min(0),
})

/**
 * 个人资料读取/修改的统一响应。
 * 只包含展示与编辑需要的字段：passwordHash 是敏感数据，禁止出现在任何响应里（AUTH-09）。
 * pendingEmail / pendingPhone 是「已申请但尚未确认」的新联系方式（AUTH-15 / AUTH-16），
 * 确认前 email / phone 仍是原值，仍可正常登录。
 */
export const meProfileSchema = z.object({
  email: z.string(),
  phone: z.string().nullable(),
  nickname: z.string().nullable(),
  pendingEmail: z.string().nullable(),
  pendingPhone: z.string().nullable(),
})

/**
 * 资料修改接口的响应：在资料字段之外，开发环境可能额外返回确认凭证。
 * devConfirmUrl / devCode 与找回密码的 devResetUrl 同理——未配置邮件/短信服务时方便本机走完流程，
 * 生产环境永远不返回，否则等于跳过「证明联系方式归属」这一步。
 */
export const meProfileUpdateResultSchema = meProfileSchema.extend({
  devConfirmUrl: z.string().optional(),
  devCode: z.string().optional(),
})

/**
 * 手机号换绑确认：验证码来自短信，6 位数字（AUTH-16）。
 * 只校验格式，是否正确、是否过期由服务端结合 pendingPhoneCodeHash 判断。
 */
export const mePhoneConfirmSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, '请输入 6 位数字验证码'),
})

/** 手机号换绑成功响应：回传换绑后的号码，前端可直接展示。 */
export const mePhoneConfirmResultSchema = z.object({
  ok: z.literal(true),
  phone: z.string(),
})

/**
 * 个人资料修改：昵称、手机号与邮箱（AUTH-07 / AUTH-11）。
 * 邮箱是登录凭证，修改时必须同时提交当前密码：仅凭会话 cookie 不能改走登录身份。
 * 字段传空串表示「清空」，服务端会归一成 null，防止空串占用 phone 唯一索引。
 */
export const meProfileUpdateSchema = z
  .object({
    nickname: z
      .string()
      .trim()
      .max(20, '昵称最多 20 个字符')
      // 允许留空清空昵称；一旦填写就要求至少 2 字，避免出现单字无意义昵称。
      .refine((val) => val.length === 0 || val.length >= 2, '昵称至少 2 个字符')
      .optional(),
    phone: z.string().trim().max(20, '手机号最多 20 个字符').optional(),
    // 邮箱格式与注册接口保持一致；统一转小写，避免大小写不同被当成两个账号。
    email: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, '邮箱格式不正确')
      .optional(),
    // 只有改邮箱时才需要；服务端仍会用哈希校验，不能只靠前端必填。
    currentPassword: z.string().optional(),
  })
  .refine((val) => !val.email || !!val.currentPassword, {
    message: '修改邮箱需要填写当前密码',
    path: ['currentPassword'],
  })

/**
 * 修改密码：必须带当前密码（AUTH-09），新密码沿用注册的 8 位下限。
 * 确认密码是前端交互概念，不放进接口契约。
 */
export const mePasswordUpdateSchema = z.object({
  currentPassword: z.string().min(1, '请填写当前密码'),
  newPassword: z.string().min(8, '新密码至少 8 位'),
})

/** 无内容返回（修改密码）。 */
export const meOkSchema = z.object({ ok: z.literal(true) })

export type MeSummary = z.infer<typeof meSummarySchema>
export type MeProfile = z.infer<typeof meProfileSchema>
export type MeProfileUpdate = z.infer<typeof meProfileUpdateSchema>
export type MeProfileUpdateResult = z.infer<typeof meProfileUpdateResultSchema>
export type MePhoneConfirm = z.infer<typeof mePhoneConfirmSchema>
export type MePhoneConfirmResult = z.infer<typeof mePhoneConfirmResultSchema>
export type MePasswordUpdate = z.infer<typeof mePasswordUpdateSchema>
