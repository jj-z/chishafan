// 随机推荐一餐接口：/api/dishes/random。
// 业务规则见 domain MEAL-01~08 / DISH-04~06；具体抽签逻辑在 server/utils/dish.ts。

import { randomQuerySchema, randomResultSchema } from '../../../shared/schemas/dish'
import { pickRandomMeal } from '../../utils/dish'
import { loadRecommendContext, toAmbientDto } from '../../utils/recommend'

export default defineEventHandler(async (event) => {
  const query = validateQuery(event, randomQuerySchema)

  // 游客也能抽签；只有登录用户才按近 N 天历史去重与口味偏好过滤（DISH-05 / PREF-01~04）。
  // 用 getOptionalActiveUser 而不是 getUserSession：改密/注销后残留的旧 cookie
  // 不能继续沿用里面的 userId，否则会拿失效会话读取该账号的偏好与历史（AUTH-12）。
  const user = await getOptionalActiveUser(event)
  const userId = user?.id ?? null

  // 偏好与 IP/天气并行加载；外部服务失败会 fail-open，不影响抽签。
  const context = await loadRecommendContext(event, userId)
  const result = await pickRandomMeal(userId, query, context)
  return assertResponse(
    randomResultSchema,
    {
      ...result,
      ambient: toAmbientDto(context),
      preferenceApplied: context.preferenceApplied,
    },
    '随机一餐',
  )
})
