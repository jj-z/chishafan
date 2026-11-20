// server/utils/adminUser.ts
// 后台用户管理的数据映射：列表与状态变更接口共用同一份 select 与 DTO 转换，
// 避免两个接口返回的字段或时间格式不一致。响应绝不包含 passwordHash（AUTH-09）。

import type { Prisma } from '../../shared/generated/prisma/client'
import type { AdminUser } from '../../shared/schemas/admin'

/** 后台用户列表/详情统一字段：只取展示与操作需要的列，passwordHash 永远不在其中。 */
export const adminUserSelect = {
  id: true,
  email: true,
  phone: true,
  nickname: true,
  role: true,
  disabledAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect

type AdminUserRow = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>

/**
 * Prisma 行 → 接口 DTO。
 * 时间统一转 ISO 字符串：JSON 里 Date 也会被序列化，但显式转换能让 Zod 契约（z.string）成立。
 */
export function toAdminUser(row: AdminUserRow): AdminUser {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    nickname: row.nickname,
    role: row.role,
    disabledAt: row.disabledAt ? row.disabledAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }
}
