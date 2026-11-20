// server/utils/adminAudit.ts
// 后台操作审计（P2-11 / ADMIN-02，P2-13 泛化为用户 / 菜品 / 分类三类目标）。
// 调用方必须传入事务客户端，保证「业务更新 + 审计」原子提交：
// 只写业务不写审计、或审计写成功而业务回滚，都会让事后追责失真。
// detail 只允许放变更后的值（新角色、菜名等），禁止传入密码明文或哈希。

import type { Prisma } from '../../shared/generated/prisma/client'
import type { AdminAuditAction, AdminAuditTargetType } from '../../shared/generated/prisma/enums'

/** 一次审计写入所需的最小信息。 */
export interface AdminAuditInput {
  adminId: string
  action: AdminAuditAction
  /** USER / DISH / CATEGORY，与 targetId 一起定位被操作对象。 */
  targetType: AdminAuditTargetType
  targetId: string
  detail?: string
}

/** 在给定事务内写一条后台操作审计。 */
export async function recordAdminAudit(
  tx: Prisma.TransactionClient,
  input: AdminAuditInput,
): Promise<void> {
  await tx.adminAuditLog.create({
    data: {
      adminId: input.adminId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      detail: input.detail ?? null,
    },
  })
}
