// 保存当前用户口味偏好：PUT /api/preferences。
// 采用整体覆盖（upsert）而不是局部更新：偏好页本来就是整表提交，
// 全量写入可以避免“哪些字段允许部分更新”的判断，语义与后台菜品表单一致。

import { preferenceSchema } from '../../../shared/schemas/preference'
import { loadPreference } from '../../utils/preference'

export default defineEventHandler(async (event) => {
  const user = await requireActiveUser(event)
  // preferenceSchema 同时校验字段范围与「喜欢/不喜欢不能选同一菜系」。
  const body = await validateBody(event, preferenceSchema)

  await prisma.userPreference.upsert({
    where: { userId: user.id },
    update: body,
    create: { userId: user.id, ...body },
  })

  // 回读一次，保证接口返回的就是数据库里的最终状态。
  const preference = await loadPreference(user.id)
  return assertResponse(preferenceSchema, preference, '口味偏好')
})
