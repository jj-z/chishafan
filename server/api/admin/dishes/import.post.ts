// 导入菜品 CSV：POST /api/admin/dishes/import（P2-15）。
// 设计要点：
// 1) dryRun 只校验不落库，运营可以先看失败明细再决定是否真的导入；
// 2) 逐行校验并返回行号（含表头，从 1 开始），与 Excel 行号一致，便于定位；
// 3) 单行失败不影响其他行，但整批写入放在一个事务里，避免「导入一半」的中间状态。

import {
  adminDishImportBodySchema,
  adminDishImportResultSchema,
  dishWriteBodySchema,
} from '../../../../shared/schemas/admin'
import { parseCsv } from '../../../utils/csv'
import { scheduleKnowledgeSync } from '../../../utils/knowledge'
import { ALLERGEN_CODES } from '../../../../shared/types/dish'
import type { Allergen, DishRole, MealType, ServingMode } from '../../../../shared/types/dish'
import {
  ALLERGEN_LABELS,
  MEAL_LABELS,
  ROLE_LABELS,
  SERVING_LABELS,
} from '../../../../shared/utils/dish'

/** 单次导入上限：再多就不适合用 CSV 手工维护，应该走批量接口或数据迁移。 */
const MAX_IMPORT_ROWS = 500

/** 把「代码 → 中文标签」翻成双向查表：导入时中文和代码都接受。 */
function buildLookup<T extends string>(labels: Record<T, string>, extra?: Record<string, T>) {
  const map = new Map<string, T>()
  for (const [code, label] of Object.entries(labels)) {
    map.set(label as string, code as T)
    map.set(code, code as T)
  }
  for (const [key, value] of Object.entries(extra ?? {})) map.set(key, value)
  return map
}

const mealLookup = buildLookup<MealType>(MEAL_LABELS, { 不限: 'ANY' })
const servingLookup = buildLookup<ServingMode>(SERVING_LABELS, { 单品: 'SINGLE', 需要搭配: 'DISH' })
const roleLookup = buildLookup<DishRole>(ROLE_LABELS)
const allergenLookup = new Map<string, Allergen>(
  ALLERGEN_CODES.map((code) => [code, code] as const),
)
for (const [code, label] of Object.entries(ALLERGEN_LABELS)) {
  allergenLookup.set(label, code as Allergen)
}

/** 解析「是/否」这类布尔列，空值按默认值处理。 */
function parseBooleanCell(value: string, fallback: boolean): boolean {
  const normalized = value.trim().toLowerCase()
  if (['是', 'true', '1', 'yes', 'y'].includes(normalized)) return true
  if (['否', 'false', '0', 'no', 'n'].includes(normalized)) return false
  return fallback
}

/** 用 | 、 ; ； 分隔多值单元格，Excel 里手填这些符号都比较自然。 */
function splitMulti(value: string): string[] {
  return value
    .split(/[|、;；]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await validateBody(event, adminDishImportBodySchema)

  const lines = parseCsv(body.csv)
  if (lines.length === 0) throw createError({ statusCode: 400, statusMessage: 'CSV 内容为空' })

  const header = lines[0]!.map((cell) => cell.trim())
  const columnIndex = (name: string) => header.indexOf(name)
  const missingHeaders = ['名称', '分类'].filter((name) => columnIndex(name) === -1)
  if (missingHeaders.length > 0) {
    throw createError({
      statusCode: 400,
      statusMessage: `CSV 缺少必需列：${missingHeaders.join('、')}`,
    })
  }

  const categories = await prisma.category.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  })
  const categoryIdByName = new Map(categories.map((item) => [item.name, item.id]))

  // 预取现有「分类 + 菜名」，避免导入时把同一道菜重复写两遍。
  const existing = await prisma.dish.findMany({
    where: { deletedAt: null },
    select: { name: true, categoryId: true },
  })
  const existingKeys = new Set(existing.map((item) => `${item.categoryId}::${item.name}`))

  const dataRows = lines.slice(1)
  const failed: { row: number; message: string }[] = []
  const valid: {
    name: string
    data: ReturnType<typeof dishWriteBodySchema.parse>
  }[] = []

  dataRows.forEach((cells, index) => {
    // 行号含表头：Excel 里表头是第 1 行，所以数据第一行是第 2 行。
    const rowNumber = index + 2
    if (valid.length + failed.length >= MAX_IMPORT_ROWS) {
      failed.push({ row: rowNumber, message: `单次最多导入 ${MAX_IMPORT_ROWS} 行` })
      return
    }

    const get = (name: string): string => {
      const position = columnIndex(name)
      return position === -1 ? '' : (cells[position] ?? '').trim()
    }

    const categoryName = get('分类')
    const categoryId = categoryIdByName.get(categoryName)
    if (!categoryId) {
      failed.push({ row: rowNumber, message: `分类不存在或已删除：${categoryName || '（空）'}` })
      return
    }

    // 过敏原要么是中文标签、要么是代码，无法识别时整行拒绝，避免静默丢标签。
    const allergenTokens = splitMulti(get('过敏原'))
    const unknownAllergen = allergenTokens.find((token) => !allergenLookup.has(token))
    if (unknownAllergen) {
      failed.push({ row: rowNumber, message: `无法识别的过敏原：${unknownAllergen}` })
      return
    }

    const mealType = mealLookup.get(get('餐别') || '随时') ?? 'ANY'
    const servingMode = servingLookup.get(get('形态') || '配菜') ?? 'DISH'
    const role = roleLookup.get(get('角色') || '主菜') ?? 'MAIN'

    const parsed = dishWriteBodySchema.safeParse({
      name: get('名称'),
      categoryId,
      description: get('描述') || undefined,
      imageUrl: get('图片') || undefined,
      mealType,
      servingMode,
      role,
      spicyLevel: get('辣度') || 0,
      priceLevel: get('价格档位') || 1,
      tags: splitMulti(get('标签')),
      ingredients: splitMulti(get('食材')),
      allergens: allergenTokens.map((token) => allergenLookup.get(token)),
      steps: get('做法') || undefined,
      isPublished: parseBooleanCell(get('上架'), true),
    })

    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const field = issue?.path.join('.')
      failed.push({
        row: rowNumber,
        message: field ? `${field}: ${issue?.message}` : (issue?.message ?? '格式不合法'),
      })
      return
    }

    const key = `${parsed.data.categoryId}::${parsed.data.name}`
    if (existingKeys.has(key)) {
      failed.push({ row: rowNumber, message: `同名菜品已存在：${parsed.data.name}` })
      return
    }
    existingKeys.add(key)
    valid.push({ name: parsed.data.name, data: parsed.data })
  })

  // dryRun 只回报校验结果，不碰数据库。
  if (body.dryRun || valid.length === 0) {
    return assertResponse(
      adminDishImportResultSchema,
      { accepted: valid.length, failed, dryRun: body.dryRun },
      '导入菜品',
    )
  }

  const createdIds = await prisma.$transaction(async (tx) => {
    const ids: string[] = []
    for (const item of valid) {
      const created = await tx.dish.create({
        data: {
          name: item.data.name,
          categoryId: item.data.categoryId,
          description: item.data.description ?? null,
          imageUrl: item.data.imageUrl ?? null,
          mealType: item.data.mealType,
          servingMode: item.data.servingMode,
          role: item.data.role,
          spicyLevel: item.data.spicyLevel,
          priceLevel: item.data.priceLevel,
          tags: item.data.tags,
          ingredients: item.data.ingredients,
          allergens: item.data.allergens,
          steps: item.data.steps ?? null,
          isPublished: item.data.isPublished,
        },
        select: { id: true },
      })
      ids.push(created.id)
    }
    await tx.adminAuditLog.createMany({
      data: ids.map((id) => ({
        adminId: admin.id,
        action: 'CREATE_DISH' as const,
        targetType: 'DISH' as const,
        targetId: id,
        detail: 'CSV 导入',
      })),
    })
    return ids
  })

  // 导入的菜同样是知识库的一部分：异步补片段与向量，失败不影响导入结果。
  scheduleKnowledgeSync(createdIds)

  return assertResponse(
    adminDishImportResultSchema,
    { accepted: valid.length, failed, dryRun: false },
    '导入菜品',
  )
})
