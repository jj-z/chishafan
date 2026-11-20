// 获取当前用户口味偏好：/api/preferences。
// 未登录返回 401（AUTH-02）；没有记录时返回默认值，前端无需区分“没设置”和“空偏好”。

import { preferenceSchema } from '../../../shared/schemas/preference'
import { loadPreference } from '../../utils/preference'

export default defineEventHandler(async (event) => {
  const user = await requireActiveUser(event)
  const preference = await loadPreference(user.id)
  return assertResponse(preferenceSchema, preference, '口味偏好')
})
