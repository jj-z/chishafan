// 导出全部菜品为 CSV：GET /api/admin/dishes/export（P2-15）。
// 导出格式与导入共用同一套中文表头，运营可以在 Excel 里改完直接导回。

import { toCsv } from '../../../utils/csv'
import {
  ALLERGEN_LABELS,
  MEAL_LABELS,
  ROLE_LABELS,
  SERVING_LABELS,
} from '../../../../shared/utils/dish'

/** 固定列顺序：导入时会按表头名取值，不依赖列顺序，但导出的顺序要稳定便于比对。 */
const HEADERS = [
  '名称',
  '分类',
  '餐别',
  '形态',
  '角色',
  '辣度',
  '价格档位',
  '标签',
  '食材',
  '过敏原',
  '图片',
  '描述',
  '做法',
  '上架',
]

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const dishes = await prisma.dish.findMany({
    where: { deletedAt: null },
    orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
    select: {
      name: true,
      mealType: true,
      servingMode: true,
      role: true,
      spicyLevel: true,
      priceLevel: true,
      tags: true,
      ingredients: true,
      allergens: true,
      imageUrl: true,
      description: true,
      steps: true,
      isPublished: true,
      category: { select: { name: true } },
    },
  })

  const rows = dishes.map((dish) => [
    dish.name,
    dish.category.name,
    MEAL_LABELS[dish.mealType],
    SERVING_LABELS[dish.servingMode],
    ROLE_LABELS[dish.role],
    String(dish.spicyLevel),
    String(dish.priceLevel),
    dish.tags.join('|'),
    dish.ingredients.join('|'),
    dish.allergens.map((code) => ALLERGEN_LABELS[code]).join('|'),
    dish.imageUrl ?? '',
    dish.description ?? '',
    dish.steps ?? '',
    dish.isPublished ? '是' : '否',
  ])

  // 带 BOM 输出，否则 Windows Excel 会把中文识别成乱码。
  const csv = `\uFEFF${toCsv(HEADERS, rows)}`
  const stamp = new Date().toISOString().slice(0, 10)

  setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'content-disposition', `attachment; filename="dishes-${stamp}.csv"`)
  return csv
})
