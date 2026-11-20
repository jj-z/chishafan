// 管理后台的请求/响应契约。
// 与用户端 schema 的关系：用户端只看到已上架菜品，后台还需要 isPublished / createdAt 等
// 运营字段，所以在 dishSchema 上扩展出 adminDishSchema，避免为后台再手写一份菜品类型。

import { z } from 'zod'
import { pageResultSchema } from './common'
import { allergenEnum, dishRoleEnum, dishSchema, mealTypeEnum, servingModeEnum } from './dish'

/** 后台菜品：在用户端字段基础上补充上架状态与时间戳（时间统一用 ISO 字符串传输）。 */
export const adminDishSchema = dishSchema.extend({
  isPublished: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/**
 * 图片地址：允许两种形式——
 * - 外链 http(s)://…（历史数据与临时贴图）；
 * - 本站上传后的相对路径 /uploads/dishes/…（推荐，图片存在自己的磁盘/卷上，不受第三方失效影响）。
 * 留空表示暂无图，由前端占位。
 */
const optionalImageUrl = z.preprocess(
  (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
  z
    .string()
    .trim()
    .max(500, '图片地址最多 500 字')
    .refine(
      (val) => /^https?:\/\/\S+$/i.test(val) || /^\/uploads\/[\w./-]+$/.test(val),
      '图片需为合法链接或上传后的站内路径',
    )
    .optional(),
)

/**
 * 新增/编辑菜品共用的请求体。
 * 编辑也要求提交完整表单（等价 PUT 语义）：后台表单本来就是整体提交，
 * 用全量字段可以省掉“哪些字段允许部分更新”的判断，减少出错面。
 */
export const dishWriteBodySchema = z.object({
  name: z.string().trim().min(1, '请填写菜名').max(50, '菜名最多 50 字'),
  categoryId: z.string().min(1, '请选择分类'),
  description: z.string().trim().max(500, '描述最多 500 字').optional(),
  imageUrl: optionalImageUrl,
  mealType: mealTypeEnum.default('ANY'),
  servingMode: servingModeEnum.default('DISH'),
  role: dishRoleEnum.default('MAIN'),
  // 辣度 0-3、价格档位 1-3，与 Prisma 字段含义一致。
  spicyLevel: z.coerce.number().int().min(0).max(3).default(0),
  priceLevel: z.coerce.number().int().min(1).max(3).default(1),
  tags: z.array(z.string().trim().min(1)).max(20, '标签最多 20 个').default([]),
  ingredients: z.array(z.string().trim().min(1)).max(30, '食材最多 30 项').default([]),
  // 受控过敏原：用户偏好里的忌口按它做硬过滤，后台必须能维护。
  allergens: z.array(allergenEnum).max(14, '过敏原最多 14 项').default([]),
  steps: z.string().trim().max(2000, '做法最多 2000 字').optional(),
  isPublished: z.boolean().default(true),
})

/** 后台菜品列表查询：比用户端多一个“不过滤上架状态”的能力，方便运营看到下架菜。 */
export const adminDishesQuerySchema = z.object({
  keyword: z.string().trim().max(50).optional(),
  categoryId: z.string().optional(),
  /**
   * 质量巡检筛选（P2-14）：只看资料不完整的菜品。
   * 不提供「无分类」：DISH-01 要求菜品必须归属分类，缺分类的脏数据不该存在。
   */
  missing: z.enum(['image', 'allergens', 'ingredients']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
})

export const adminDishListResultSchema = pageResultSchema(adminDishSchema)

/** 后台分类：用户端只需要 id/name，后台还要排序值来判断展示顺序。 */
export const adminCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
})

export const adminCategoryListSchema = z.array(adminCategorySchema)

export const categoryWriteBodySchema = z.object({
  name: z.string().trim().min(1, '请填写分类名').max(30, '分类名最多 30 字'),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
})

/** 删除类接口的统一响应：只表示“操作已完成”，不返回被删对象。 */
export const deleteOkSchema = z.object({
  ok: z.literal(true),
})

/**
 * 上传菜品图的响应（P3：本地上传）。
 * url 是站内相对路径，调用方直接写进表单的 imageUrl；fileName 便于排查磁盘上的文件。
 */
export const adminUploadResultSchema = z.object({
  url: z.string().startsWith('/uploads/dishes/'),
  fileName: z.string(),
})

/**
 * 后台用户管理（P2-11 / ADMIN-01）。
 * 状态由 disabledAt 是否为空推导，不额外存状态字段，避免两份数据不一致。
 * 响应绝不包含 passwordHash（AUTH-09）。
 */
export const adminUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  nickname: z.string().nullable(),
  role: z.enum(['USER', 'ADMIN']),
  disabledAt: z.string().nullable(),
  createdAt: z.string(),
})

export const adminUsersQuerySchema = z.object({
  // 邮箱 / 手机号 / 昵称统一进一个搜索框，运营不需要记住要去哪个字段搜。
  keyword: z.string().trim().max(50, '搜索词最多 50 字').optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
})

export const adminUserListResultSchema = pageResultSchema(adminUserSchema)

/**
 * 禁用/启用与角色变更共用一个 PATCH：两者都是“改用户状态”，
 * 同时提交时在一次事务里完成，审计也能对应到同一次操作。
 * 至少提交一个字段才有意义，两个都不传直接拒绝。
 */
export const adminUserUpdateSchema = z
  .object({
    role: z.enum(['USER', 'ADMIN']).optional(),
    disabled: z.boolean().optional(),
  })
  .refine((val) => val.role !== undefined || val.disabled !== undefined, {
    message: '请选择要修改的角色或状态',
  })

/** 管理员重置密码：新密码沿用注册的 8 位下限（AUTH-04）。 */
export const adminUserResetPasswordSchema = z.object({
  password: z.string().min(8, '密码至少 8 位'),
})

export const adminUserParamsSchema = z.object({
  id: z.string().min(1),
})

/** 重置密码等无内容返回。 */
export const adminUserOkSchema = z.object({ ok: z.literal(true) })

/**
 * 数据看板时间范围（P2-12）。
 * 只允许 7 / 30 天：范围越大聚合越慢，运营看趋势也不需要任意区间。
 */
export const adminStatsQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((value) => value === 7 || value === 30, '仅支持最近 7 天或 30 天')
    .default(7),
})

/**
 * 看板响应。所有计数都是整数，比例用 0~1 的小数（前端再格式化成百分比），
 * 避免服务端按某种精度四舍五入后前端无法还原。
 */
export const adminStatsSchema = z.object({
  range: z.object({
    days: z.number().int(),
    from: z.string(),
    to: z.string(),
  }),
  totals: z.object({
    users: z.number().int(),
    dishes: z.number().int(),
    publishedDishes: z.number().int(),
    favorites: z.number().int(),
    histories: z.number().int(),
  }),
  trend: z.array(
    z.object({
      date: z.string(),
      histories: z.number().int(),
      newUsers: z.number().int(),
    }),
  ),
  topDishes: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      count: z.number().int(),
    }),
  ),
  emptySearches: z.array(
    z.object({
      keyword: z.string(),
      count: z.number().int(),
    }),
  ),
  ai: z.object({
    total: z.number().int(),
    failed: z.number().int(),
    failureRate: z.number(),
    avgDurationMs: z.number().int(),
  }),
})

export type AdminStats = z.infer<typeof adminStatsSchema>
export type AdminStatsQuery = z.infer<typeof adminStatsQuerySchema>

/**
 * 后台操作审计（P2-13 / ADMIN-04）。
 * action 用字面量枚举而不是从 Prisma 生成类型推导：这是对外契约，
 * 新增动作时必须显式改这里，避免数据库加了枚举值而前端悄悄拿到未知值。
 */
export const adminAuditActionEnum = z.enum([
  'DISABLE_USER',
  'ENABLE_USER',
  'CHANGE_ROLE',
  'RESET_PASSWORD',
  'CREATE_DISH',
  'UPDATE_DISH',
  'DELETE_DISH',
  'CREATE_CATEGORY',
  'UPDATE_CATEGORY',
  'DELETE_CATEGORY',
])

export const adminAuditTargetTypeEnum = z.enum(['USER', 'DISH', 'CATEGORY'])

export const adminAuditLogSchema = z.object({
  id: z.string(),
  adminId: z.string(),
  /** 操作人邮箱；管理员账号被软删除时仍能显示，便于追责。 */
  adminEmail: z.string(),
  action: adminAuditActionEnum,
  targetType: adminAuditTargetTypeEnum,
  targetId: z.string(),
  detail: z.string().nullable(),
  createdAt: z.string(),
})

export const adminAuditQuerySchema = z.object({
  targetType: adminAuditTargetTypeEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})

export const adminAuditListResultSchema = pageResultSchema(adminAuditLogSchema)

export type AdminAuditLog = z.infer<typeof adminAuditLogSchema>
export type AdminAuditQuery = z.infer<typeof adminAuditQuerySchema>
export type AdminAuditListResult = z.infer<typeof adminAuditListResultSchema>

/**
 * 批量操作（P2-15）：上架 / 下架 / 改分类。
 * ids 上限 200：一次 updateMany 太大容易长时间锁表，也让「部分失败」难解释。
 */
export const adminDishBatchBodySchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1).max(200),
    action: z.enum(['publish', 'unpublish', 'category']),
    categoryId: z.string().min(1).optional(),
  })
  .refine((value) => value.action !== 'category' || Boolean(value.categoryId), {
    message: '批量改分类必须指定目标分类',
    path: ['categoryId'],
  })

export const adminDishBatchResultSchema = z.object({
  updated: z.number().int(),
})

/**
 * CSV 导入（P2-15）。
 * dryRun=true 只校验不落库，让运营先看到失败明细再决定是否真的导入。
 */
export const adminDishImportBodySchema = z.object({
  csv: z.string().min(1).max(500_000),
  dryRun: z.boolean().default(false),
})

export const adminDishImportResultSchema = z.object({
  /** 校验通过（并已写入，dryRun 时为「将会写入」）的行数。 */
  accepted: z.number().int(),
  failed: z.array(
    z.object({
      /** CSV 中的行号（含表头行，从 1 开始），方便运营直接定位到 Excel 行。 */
      row: z.number().int(),
      message: z.string(),
    }),
  ),
  dryRun: z.boolean(),
})

export type AdminDishBatchBody = z.infer<typeof adminDishBatchBodySchema>
export type AdminDishImportBody = z.infer<typeof adminDishImportBodySchema>
export type AdminDishImportResult = z.infer<typeof adminDishImportResultSchema>

export type AdminDish = z.infer<typeof adminDishSchema>
export type DishWriteBody = z.infer<typeof dishWriteBodySchema>
export type AdminDishesQuery = z.infer<typeof adminDishesQuerySchema>
export type AdminDishListResult = z.infer<typeof adminDishListResultSchema>
export type AdminCategory = z.infer<typeof adminCategorySchema>
export type CategoryWriteBody = z.infer<typeof categoryWriteBodySchema>
export type AdminUser = z.infer<typeof adminUserSchema>
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>
export type AdminUserListResult = z.infer<typeof adminUserListResultSchema>
export type AdminUserUpdate = z.infer<typeof adminUserUpdateSchema>
export type AdminUserResetPassword = z.infer<typeof adminUserResetPasswordSchema>
