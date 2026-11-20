<script setup lang="ts">
// 后台菜品管理：筛选 + 分页 + 新增/编辑弹窗 + 删除。
// 只用 Element Plus（与用户端 Vant 严格分开），所有接口响应都经过 shared/schemas/admin.ts 校验。

import { ElMessage, ElMessageBox } from 'element-plus'
import {
  adminDishBatchResultSchema,
  adminDishImportResultSchema,
  adminDishListResultSchema,
  adminDishSchema,
  adminUploadResultSchema,
  deleteOkSchema,
  dishWriteBodySchema,
} from '#shared/schemas/admin'
import type { AdminDish, AdminDishImportResult } from '#shared/schemas/admin'
import type { DishRole, MealType, ServingMode } from '#shared/schemas/dish'
import type { Allergen } from '#shared/types/dish'
import { ALLERGEN_LABELS, PRICE_LABELS, SPICY_LABELS } from '#shared/utils/dish'
import { compressImage } from '~/utils/compressImage'

definePageMeta({ layout: 'admin' })

usePageSeo({ title: '菜品管理' })

const { categories, loadCategories, categoryName } = useAdminCategories()

// 枚举到中文的映射集中在这里，表格展示和下拉选项共用一份，避免两处文案不一致。
const mealTypeLabels: Record<MealType, string> = {
  ANY: '通用',
  BREAKFAST: '早餐',
  LUNCH: '午餐',
  DINNER: '晚餐',
}
const servingModeLabels: Record<ServingMode, string> = { SINGLE: '单品', DISH: '菜品' }
const roleLabels: Record<DishRole, string> = { MAIN: '主菜', VEG: '素菜', SOUP: '汤' }
// 下标即字段值：辣度 0-3、价格档位 1-3（与 Prisma 字段含义一致）
const spicyLabels = [...SPICY_LABELS]
const priceLabels = [...PRICE_LABELS]

// el-select 需要 { value, label } 数组，从上面的映射直接生成，避免枚举字面量再写一遍
const mealTypeOptions = Object.entries(mealTypeLabels).map(([value, label]) => ({ value, label }))
const servingModeOptions = Object.entries(servingModeLabels).map(([value, label]) => ({
  value,
  label,
}))
const roleOptions = Object.entries(roleLabels).map(([value, label]) => ({ value, label }))
const spicyOptions = spicyLabels.map((label, value) => ({ value, label }))
const priceOptions = priceLabels.map((label, index) => ({ value: index + 1, label }))
// 过敏原选项与用户偏好页共用同一份中文名，避免两处文案不一致。
const allergenOptions = Object.entries(ALLERGEN_LABELS).map(([value, label]) => ({ value, label }))

const list = ref<AdminDish[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(15)
const PAGE_SIZES = [10, 15, 20, 50]
const keyword = ref('')
const categoryId = ref('')
// 质量巡检筛选（P2-14）：空字符串表示看全部，否则只列资料不完整的菜。
const missing = ref('')
const loading = ref(false)

/** 巡检筛选项；文案与后端 missing 枚举一一对应。 */
const missingOptions = [
  { value: 'image', label: '缺图片' },
  { value: 'allergens', label: '缺过敏原' },
  { value: 'ingredients', label: '缺食材' },
]

/**
 * 一行菜品还缺哪些资料。与后端 missing 筛选口径保持一致：
 * 图片只看「有没有值」（空字符串算缺），过敏原/食材看数组是否为空。
 */
function missingTags(dish: AdminDish): string[] {
  const tags: string[] = []
  if (!dish.imageUrl) tags.push('缺图片')
  if (dish.allergens.length === 0) tags.push('缺过敏原')
  if (dish.ingredients.length === 0) tags.push('缺食材')
  return tags
}

/**
 * 拉取当前页数据。筛选条件变化时调用方会先把 page 重置为 1，
 * 否则停在第 3 页再筛选可能直接越界得到空表格。
 */
async function fetchList() {
  loading.value = true
  try {
    const data = await apiFetch('/api/admin/dishes', adminDishListResultSchema, {
      query: {
        ...(keyword.value.trim() ? { keyword: keyword.value.trim() } : {}),
        ...(categoryId.value ? { categoryId: categoryId.value } : {}),
        ...(missing.value ? { missing: missing.value } : {}),
        page: page.value,
        pageSize: pageSize.value,
      },
    })
    list.value = data.items
    total.value = data.total
  } catch (err) {
    ElMessage.error(adminErrorMessage(err, '加载菜品失败'))
  } finally {
    loading.value = false
  }
}

/** 查询按钮与回车共用：先回第一页再请求。 */
function search() {
  page.value = 1
  fetchList()
}

/** 重置筛选条件并重新查询。 */
function resetSearch() {
  keyword.value = ''
  categoryId.value = ''
  missing.value = ''
  search()
}

/** 分页组件只负责把页码传进来，真正的数据刷新仍由 fetchList 完成。 */
function handlePageChange(next: number) {
  page.value = next
  fetchList()
}

/** 切页大小时回到第 1 页，避免停在「超过最大页码」的空页上。 */
function handleSizeChange(next: number) {
  pageSize.value = next
  page.value = 1
  fetchList()
}

// ── 批量操作 / CSV 导入导出（P2-15）────────────────────────────────────

const tableRef = ref<{ clearSelection: () => void } | null>(null)
const selectedIds = ref<string[]>([])
const batching = ref(false)
const batchVisible = ref(false)
const batchCategoryId = ref('')

/** el-table 多选：只保留 id，提交时不需要整行数据。 */
function handleSelectionChange(rows: AdminDish[]) {
  selectedIds.value = rows.map((row) => row.id)
}

/**
 * 执行批量操作。批量上下架由工具栏按钮直接调用，批量改分类由弹窗确认后调用。
 * 成功后清空选择并刷新列表，避免用户误以为选择还停留在旧数据上。
 */
async function runBatch(action: 'publish' | 'unpublish' | 'category', targetCategoryId?: string) {
  if (selectedIds.value.length === 0) {
    ElMessage.warning('请先勾选菜品')
    return
  }
  batching.value = true
  try {
    const data = await apiFetch('/api/admin/dishes/batch', adminDishBatchResultSchema, {
      method: 'POST',
      body: {
        ids: selectedIds.value,
        action,
        ...(targetCategoryId ? { categoryId: targetCategoryId } : {}),
      },
    })
    ElMessage.success(`已更新 ${data.updated} 道菜`)
    batchVisible.value = false
    tableRef.value?.clearSelection()
    await fetchList()
  } catch (err) {
    ElMessage.error(adminErrorMessage(err, '批量操作失败'))
  } finally {
    batching.value = false
  }
}

/** 打开「批量改分类」弹窗，每次重置已选分类。 */
function openBatchCategory() {
  if (selectedIds.value.length === 0) {
    ElMessage.warning('请先勾选菜品')
    return
  }
  batchCategoryId.value = ''
  batchVisible.value = true
}

/** 导出走浏览器直接下载：接口是 GET，会话 Cookie 由同源请求自动携带。 */
function exportCsv() {
  window.location.href = '/api/admin/dishes/export'
}

const importVisible = ref(false)
const importCsv = ref('')
const importResult = ref<AdminDishImportResult | null>(null)
const importing = ref(false)

function openImport() {
  importCsv.value = ''
  importResult.value = null
  importVisible.value = true
}

/** 读取本地 CSV 文本。用 readAsText 而不是上传文件，后端只需要文本，省一次 multipart 解析。 */
function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    importCsv.value = String(reader.result ?? '')
    importResult.value = null
  }
  reader.readAsText(file, 'utf-8')
  // 清空 input，方便重复选择同一个文件（否则 change 不会再次触发）。
  input.value = ''
}

/** dryRun=true 只校验；false 才真正写库。失败明细按 CSV 行号展示。 */
async function submitImport(dryRun: boolean) {
  if (!importCsv.value.trim()) {
    ElMessage.warning('请先选择 CSV 文件')
    return
  }
  importing.value = true
  try {
    const data = await apiFetch('/api/admin/dishes/import', adminDishImportResultSchema, {
      method: 'POST',
      body: { csv: importCsv.value, dryRun },
    })
    importResult.value = data
    if (dryRun) {
      ElMessage.info(`校验完成：可导入 ${data.accepted} 行`)
    } else {
      ElMessage.success(`已导入 ${data.accepted} 道菜`)
      if (data.failed.length === 0) importVisible.value = false
      await fetchList()
    }
  } catch (err) {
    ElMessage.error(adminErrorMessage(err, '导入失败'))
  } finally {
    importing.value = false
  }
}

// 弹窗表单：文本式的 tags/ingredients 用「逗号分隔字符串」编辑，提交时再拆成数组，
// 这样新手不需要理解数组在输入框里怎么绑定。
interface DishForm {
  name: string
  categoryId: string
  description: string
  imageUrl: string
  mealType: MealType
  servingMode: ServingMode
  role: DishRole
  spicyLevel: number
  priceLevel: number
  tagsText: string
  ingredientsText: string
  allergens: Allergen[]
  steps: string
  isPublished: boolean
}

/** 新建时的空表单，默认值与 dishWriteBodySchema 的 default 对齐，保证不填也能创建成功。 */
function emptyForm(): DishForm {
  return {
    name: '',
    categoryId: '',
    description: '',
    imageUrl: '',
    mealType: 'ANY',
    servingMode: 'DISH',
    role: 'MAIN',
    spicyLevel: 0,
    priceLevel: 1,
    tagsText: '',
    ingredientsText: '',
    allergens: [],
    steps: '',
    isPublished: true,
  }
}

const dialogVisible = ref(false)
const submitting = ref(false)
// null 表示新增；有值表示编辑该 id
const editingId = ref<string | null>(null)
const form = ref<DishForm>(emptyForm())

// ---- 图片上传 ----
// 隐藏的原生 input 由「上传图片」按钮触发：比 el-upload 少一层内置列表/请求状态，
// 上传逻辑全部走 apiFetch，和项目其它接口保持一致（响应同样过 Zod 校验）。
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
/** 服务端硬上限：压缩后的文件必须不超过它，否则接口会返回 413。 */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
/**
 * 原图前置上限：手机直出照片常见 5–10MB，直接按 5MB 拦截会让管理员频繁换图。
 * 先允许到 20MB，交给 compressImage 缩到几百 KB；20MB 只是为了挡住异常大文件，
 * 避免浏览器解码时把页面内存撑爆。
 */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024

/** 上传成功提示里展示体积变化，让管理员直观看到压缩效果。 */
function formatKb(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))}KB`
}

function pickImageFile() {
  fileInput.value?.click()
}

/** 选择文件后先压缩再上传，成功即把返回的站内路径写进表单（保存菜品时才落库）。 */
async function onImageSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // 清空 value：否则连续选同一个文件不会再触发 change
  input.value = ''
  if (!file) return

  if (!file.type.startsWith('image/')) {
    ElMessage.error('请选择图片文件')
    return
  }
  if (file.size > MAX_SOURCE_BYTES) {
    ElMessage.error('原图不能超过 20MB')
    return
  }

  uploading.value = true
  try {
    // 管理员多等一两秒，换来所有访客少下载几百 KB；失败时会自动回退原图。
    const compressed = await compressImage(file)
    if (compressed.file.size > MAX_IMAGE_BYTES) {
      ElMessage.error('图片压缩后仍超过 5MB，请换一张')
      return
    }

    const body = new FormData()
    body.append('file', compressed.file)
    const data = await apiFetch('/api/admin/uploads', adminUploadResultSchema, {
      method: 'POST',
      body,
    })
    form.value.imageUrl = data.url
    ElMessage.success(
      compressed.compressed
        ? `图片已上传（${formatKb(compressed.originalBytes)} → ${formatKb(compressed.compressedBytes)}）`
        : '图片已上传',
    )
  } catch (err: unknown) {
    ElMessage.error(adminErrorMessage(err, '图片上传失败'))
  } finally {
    uploading.value = false
  }
}

/** 打开新增弹窗：重置表单，避免上一次编辑的内容残留。 */
function openCreate() {
  editingId.value = null
  Object.assign(form.value, emptyForm())
  dialogVisible.value = true
}

/** 打开编辑弹窗：把行数据回填到表单（可空字段转成空字符串，输入框才能正常绑定）。 */
function openEdit(dish: AdminDish) {
  editingId.value = dish.id
  Object.assign(form.value, {
    name: dish.name,
    categoryId: dish.categoryId,
    description: dish.description ?? '',
    imageUrl: dish.imageUrl ?? '',
    mealType: dish.mealType,
    servingMode: dish.servingMode,
    role: dish.role,
    spicyLevel: dish.spicyLevel,
    priceLevel: dish.priceLevel,
    tagsText: dish.tags.join('，'),
    ingredientsText: dish.ingredients.join('，'),
    allergens: dish.allergens,
    steps: dish.steps ?? '',
    isPublished: dish.isPublished,
  })
  dialogVisible.value = true
}

/** 用户习惯用中文逗号或换行分隔，统一拆分后交给 schema 校验（空项直接丢弃）。 */
function splitList(text: string): string[] {
  return text
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 保存：前端先过 schema 拿到即时提示，再把 parsed.data 发给服务端（新增 POST / 编辑 PUT）。 */
async function submit() {
  const parsed = dishWriteBodySchema.safeParse({
    name: form.value.name,
    categoryId: form.value.categoryId,
    // 空字符串交给 optionalImageUrl 的 preprocess 归一化，这里保持原样即可
    description: form.value.description.trim() || undefined,
    imageUrl: form.value.imageUrl.trim() || undefined,
    mealType: form.value.mealType,
    servingMode: form.value.servingMode,
    role: form.value.role,
    spicyLevel: form.value.spicyLevel,
    priceLevel: form.value.priceLevel,
    tags: splitList(form.value.tagsText),
    ingredients: splitList(form.value.ingredientsText),
    allergens: form.value.allergens,
    steps: form.value.steps.trim() || undefined,
    isPublished: form.value.isPublished,
  })
  if (!parsed.success) {
    ElMessage.error(parsed.error.issues[0]?.message ?? '请检查表单')
    return
  }

  const isEditing = Boolean(editingId.value)
  submitting.value = true
  try {
    if (editingId.value) {
      await apiFetch(`/api/admin/dishes/${editingId.value}`, adminDishSchema, {
        method: 'PUT',
        body: parsed.data,
      })
    } else {
      await apiFetch('/api/admin/dishes', adminDishSchema, {
        method: 'POST',
        body: parsed.data,
      })
    }
    ElMessage.success(isEditing ? '已保存' : '已新增')
    dialogVisible.value = false
    // 新增后列表按更新时间倒序，回第一页才能看到刚创建的菜
    if (!isEditing && page.value !== 1) {
      page.value = 1
    }
    fetchList()
  } catch (err) {
    ElMessage.error(adminErrorMessage(err, '保存失败'))
  } finally {
    submitting.value = false
  }
}

/** 删除（服务端软删除）：二次确认后再请求；当前页只剩一条时回退一页，避免留下空白页。 */
async function remove(dish: AdminDish) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${dish.name}」吗？删除后前台不再展示，但历史记录仍保留菜名。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    // ElMessageBox 在用户点「取消」时会 reject，这里只是取消操作，不需要提示
    return
  }

  try {
    await apiFetch(`/api/admin/dishes/${dish.id}`, deleteOkSchema, { method: 'DELETE' })
    ElMessage.success('已删除')
    if (list.value.length === 1 && page.value > 1) {
      page.value -= 1
    }
    fetchList()
  } catch (err) {
    ElMessage.error(adminErrorMessage(err, '删除失败'))
  }
}

onMounted(() => {
  // 分类下拉与列表并行请求，互不依赖
  loadCategories().catch((err) => {
    ElMessage.error(adminErrorMessage(err, '加载分类失败'))
  })
  fetchList()
})
</script>

<template>
  <div class="admin-page">
    <div class="admin-page__bar">
      <el-input
        v-model="keyword"
        class="admin-page__keyword"
        placeholder="搜索菜名"
        clearable
        @keyup.enter="search"
        @clear="search"
      />
      <el-select
        v-model="categoryId"
        class="admin-page__category"
        placeholder="全部分类"
        clearable
        @change="search"
      >
        <el-option v-for="cat in categories" :key="cat.id" :label="cat.name" :value="cat.id" />
      </el-select>
      <el-select
        v-model="missing"
        class="admin-page__category"
        placeholder="资料完整性"
        clearable
        @change="search"
      >
        <el-option
          v-for="opt in missingOptions"
          :key="opt.value"
          :label="`只看${opt.label}`"
          :value="opt.value"
        />
      </el-select>
      <el-button type="primary" @click="search">查询</el-button>
      <el-button @click="resetSearch">重置</el-button>
      <div class="admin-page__spacer" />
      <el-button :disabled="selectedIds.length === 0" @click="runBatch('publish')">
        批量上架
      </el-button>
      <el-button :disabled="selectedIds.length === 0" @click="runBatch('unpublish')">
        批量下架
      </el-button>
      <el-button :disabled="selectedIds.length === 0" @click="openBatchCategory">改分类</el-button>
      <el-button @click="exportCsv">导出 CSV</el-button>
      <el-button @click="openImport">导入 CSV</el-button>
      <el-button type="primary" @click="openCreate">新增菜品</el-button>
    </div>

    <div class="admin-page__table">
      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="list"
        border
        stripe
        height="100%"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="46" />
        <el-table-column prop="name" label="菜名" min-width="150" show-overflow-tooltip />
        <el-table-column label="分类" width="110">
          <template #default="{ row }">{{ categoryName(row.categoryId) }}</template>
        </el-table-column>
        <el-table-column label="餐别" width="80">
          <template #default="{ row }">{{ mealTypeLabels[row.mealType as MealType] }}</template>
        </el-table-column>
        <el-table-column label="形态 / 角色" width="120">
          <template #default="{ row }">
            {{ servingModeLabels[row.servingMode as ServingMode] }} /
            {{ roleLabels[row.role as DishRole] }}
          </template>
        </el-table-column>
        <el-table-column label="辣度" width="80">
          <template #default="{ row }">{{ spicyLabels[row.spicyLevel] ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="价格" width="80">
          <template #default="{ row }">{{ priceLabels[row.priceLevel - 1] ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="上架" width="90">
          <template #default="{ row }">
            <el-tag :type="row.isPublished ? 'success' : 'info'">
              {{ row.isPublished ? '已上架' : '已下架' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="资料完整度" width="190">
          <template #default="{ row }">
            <template v-if="missingTags(row as AdminDish).length">
              <el-tag
                v-for="tag in missingTags(row as AdminDish)"
                :key="tag"
                type="warning"
                size="small"
                class="admin-page__tag"
              >
                {{ tag }}
              </el-tag>
            </template>
            <el-tag v-else type="success" size="small">已完善</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="140">
          <template #default="{ row }">{{ formatAdminDateTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row as AdminDish)">编辑</el-button>
            <el-button link type="danger" @click="remove(row as AdminDish)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-pagination
      class="admin-page__pager"
      layout="total, sizes, prev, pager, next, jumper"
      :total="total"
      :page-sizes="PAGE_SIZES"
      :page-size="pageSize"
      :current-page="page"
      @current-change="handlePageChange"
      @size-change="handleSizeChange"
    />

    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑菜品' : '新增菜品'"
      width="680px"
      :close-on-click-modal="false"
    >
      <el-form label-width="90px">
        <el-form-item label="菜名" required>
          <el-input v-model="form.name" maxlength="50" show-word-limit />
        </el-form-item>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="分类" required>
              <el-select
                v-model="form.categoryId"
                class="admin-page__full"
                placeholder="请选择分类"
              >
                <el-option
                  v-for="cat in categories"
                  :key="cat.id"
                  :label="cat.name"
                  :value="cat.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="餐别">
              <el-select v-model="form.mealType" class="admin-page__full">
                <el-option
                  v-for="opt in mealTypeOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="形态">
              <el-select v-model="form.servingMode" class="admin-page__full">
                <el-option
                  v-for="opt in servingModeOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="角色">
              <el-select v-model="form.role" class="admin-page__full">
                <el-option
                  v-for="opt in roleOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="辣度">
              <el-select v-model="form.spicyLevel" class="admin-page__full">
                <el-option
                  v-for="opt in spicyOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="价格档位">
              <el-select v-model="form.priceLevel" class="admin-page__full">
                <el-option
                  v-for="opt in priceOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="图片">
          <div class="dish-image">
            <div v-if="form.imageUrl" class="dish-image__preview">
              <el-image :src="form.imageUrl" fit="cover" class="dish-image__thumb" />
              <el-button link type="danger" @click="form.imageUrl = ''">移除</el-button>
            </div>
            <div class="dish-image__tools">
              <el-button :loading="uploading" @click="pickImageFile">上传图片</el-button>
              <!-- 原生 input 而不是 el-upload：上传成功的返回值要直接写回表单，不需要文件列表状态 -->
              <input
                ref="fileInput"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                @change="onImageSelected"
              />
              <span class="dish-image__hint">
                JPG / PNG / WebP，原图 ≤20MB；上传时自动压缩到长边 1600px，也可以直接粘贴外链
              </span>
            </div>
            <el-input v-model="form.imageUrl" placeholder="上传后自动填入，或粘贴 https://…" />
          </div>
        </el-form-item>

        <el-form-item label="描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="2"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="标签">
          <el-input v-model="form.tagsText" placeholder="多个标签用逗号分隔，如：下饭，快手" />
        </el-form-item>

        <el-form-item label="食材">
          <el-input
            v-model="form.ingredientsText"
            placeholder="多个食材用逗号分隔，如：鸡蛋，番茄"
          />
        </el-form-item>

        <el-form-item label="过敏原">
          <el-select
            v-model="form.allergens"
            class="admin-page__full"
            multiple
            clearable
            placeholder="用于用户忌口硬过滤，可多选"
          >
            <el-option
              v-for="opt in allergenOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="做法">
          <el-input
            v-model="form.steps"
            type="textarea"
            :rows="3"
            maxlength="2000"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="上架">
          <el-switch v-model="form.isPublished" />
          <span class="admin-page__hint">关闭后前台不再展示，但历史记录不受影响</span>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="batchVisible" title="批量修改分类" width="420px">
      <p class="admin-page__dialog-tip">
        已选择 {{ selectedIds.length }} 道菜，修改后前台分类会立即生效。
      </p>
      <el-select v-model="batchCategoryId" placeholder="选择目标分类" class="admin-page__full">
        <el-option v-for="cat in categories" :key="cat.id" :label="cat.name" :value="cat.id" />
      </el-select>
      <template #footer>
        <el-button @click="batchVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="batching"
          :disabled="!batchCategoryId"
          @click="runBatch('category', batchCategoryId)"
        >
          确定
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="importVisible" title="导入菜品 CSV" width="620px">
      <p class="admin-page__dialog-tip">
        支持「导出 CSV」后修改再导入；必填列为「名称」「分类」。导入前请先点「校验」查看失败明细。
      </p>
      <input type="file" accept=".csv,text/csv" @change="handleImportFile" />
      <div v-if="importResult" class="admin-page__import-result">
        <p>
          {{ importResult.dryRun ? '校验结果' : '导入结果' }}：成功
          {{ importResult.accepted }} 行，失败 {{ importResult.failed.length }} 行。
        </p>
        <el-table
          v-if="importResult.failed.length"
          :data="importResult.failed"
          size="small"
          max-height="240"
          border
        >
          <el-table-column prop="row" label="行号" width="70" />
          <el-table-column prop="message" label="失败原因" />
        </el-table>
      </div>
      <template #footer>
        <el-button @click="importVisible = false">关闭</el-button>
        <el-button :loading="importing" :disabled="!importCsv" @click="submitImport(true)">
          校验
        </el-button>
        <el-button
          type="primary"
          :loading="importing"
          :disabled="!importCsv"
          @click="submitImport(false)"
        >
          确认导入
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
.admin-page {
  // height: 100% 撑满 admin-main（它是滚动容器），否则 flex: 1 在 overflow-y: auto 里无法算出确定高度
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
  min-height: 0;

  &__bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    flex: none;
  }

  &__keyword {
    width: 220px;
  }

  &__category {
    width: 160px;
  }

  // 把「新增」按钮推到最右侧，筛选区与操作区在视觉上分开
  &__spacer {
    flex: 1;
  }

  // 表格容器：吃满 bar 与 pager 之外的高度，表格内部滚动
  &__table {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--el-bg-color);
    border: 1px solid var(--app-color-line);
    border-radius: var(--app-radius-md);
  }

  &__pager {
    flex: none;
    margin-top: 12px;
    justify-content: flex-end;
  }

  &__full {
    width: 100%;
  }

  &__hint {
    margin-left: 12px;
    font-size: 12px;
    color: var(--app-color-text-secondary);
  }

  // 同一行可能有多个缺失项，用 margin 而不是 gap，避免 el-table 单元格布局被 flex 破坏
  &__tag + &__tag {
    margin-left: 6px;
  }

  &__dialog-tip {
    margin: 0 0 12px;
    font-size: 13px;
    color: var(--app-color-text-secondary);
  }

  &__import-result {
    margin-top: 12px;

    p {
      margin: 0 0 8px;
      font-size: 13px;
    }
  }
}

// 图片字段：预览 + 上传按钮 + 地址输入框竖排，窄弹窗里也不会挤压
.dish-image {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;

  &__preview {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  &__thumb {
    width: 120px;
    height: 90px;
    overflow: hidden;
    background: var(--app-color-media);
    border: 1px solid var(--app-color-line);
    border-radius: var(--app-radius-sm);
  }

  &__tools {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__hint {
    font-size: 12px;
    color: var(--app-color-text-secondary);
  }
}
</style>
