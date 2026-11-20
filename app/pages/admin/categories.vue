<script setup lang="ts">
// 后台分类管理：列表 + 新增/编辑弹窗 + 删除。
// 分类数量很少，不做分页；删除前服务端会统计该分类下是否还有未删除的菜品。

import { ElMessage, ElMessageBox } from 'element-plus'
import {
  adminCategoryListSchema,
  adminCategorySchema,
  categoryWriteBodySchema,
  deleteOkSchema,
} from '#shared/schemas/admin'
import type { AdminCategory } from '#shared/schemas/admin'

definePageMeta({ layout: 'admin' })

usePageSeo({ title: '分类管理' })

const list = ref<AdminCategory[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const submitting = ref(false)
// null 表示新增；有值表示编辑该 id
const editingId = ref<string | null>(null)
const form = reactive({ name: '', sortOrder: 0 })

/** 拉取全部分类。后台分类量小，直接整表返回，按服务端排序（sortOrder 升序）展示。 */
async function fetchList() {
  loading.value = true
  try {
    list.value = await apiFetch('/api/admin/categories', adminCategoryListSchema)
  } catch (err) {
    ElMessage.error(adminErrorMessage(err, '加载分类失败'))
  } finally {
    loading.value = false
  }
}

/** 打开新增弹窗：清空表单，避免上一次编辑的内容残留。 */
function openCreate() {
  editingId.value = null
  form.name = ''
  form.sortOrder = 0
  dialogVisible.value = true
}

/** 打开编辑弹窗：把行数据回填到表单。 */
function openEdit(category: AdminCategory) {
  editingId.value = category.id
  form.name = category.name
  form.sortOrder = category.sortOrder
  dialogVisible.value = true
}

/**
 * 保存：本地先过 schema（分类名必填、最多 30 字），再按新增/编辑调不同接口。
 * 重名由服务端返回 409，这里把 statusMessage 原样提示给运营。
 */
async function submit() {
  const parsed = categoryWriteBodySchema.safeParse({
    name: form.name,
    // el-input-number 被清空时会变成 undefined，这里兜底成 0，避免 z.coerce.number 得到 NaN
    sortOrder: form.sortOrder ?? 0,
  })
  if (!parsed.success) {
    ElMessage.error(parsed.error.issues[0]?.message ?? '请检查表单')
    return
  }

  const isEditing = Boolean(editingId.value)
  submitting.value = true
  try {
    if (editingId.value) {
      await apiFetch(`/api/admin/categories/${editingId.value}`, adminCategorySchema, {
        method: 'PUT',
        body: parsed.data,
      })
    } else {
      await apiFetch('/api/admin/categories', adminCategorySchema, {
        method: 'POST',
        body: parsed.data,
      })
    }
    ElMessage.success(isEditing ? '已保存' : '已新增')
    dialogVisible.value = false
    fetchList()
  } catch (err) {
    ElMessage.error(adminErrorMessage(err, '保存失败'))
  } finally {
    submitting.value = false
  }
}

/** 删除（服务端软删除）：分类下还有菜品时服务端会返回 409 并说明原因，这里原样提示。 */
async function remove(category: AdminCategory) {
  try {
    await ElMessageBox.confirm(
      `确定删除分类「${category.name}」吗？分类下还有菜品时无法删除。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    // 用户点「取消」时 ElMessageBox 会 reject，属于正常取消，不需要提示
    return
  }

  try {
    await apiFetch(`/api/admin/categories/${category.id}`, deleteOkSchema, { method: 'DELETE' })
    ElMessage.success('已删除')
    fetchList()
  } catch (err) {
    ElMessage.error(adminErrorMessage(err, '删除失败'))
  }
}

onMounted(fetchList)
</script>

<template>
  <div class="admin-page">
    <div class="admin-page__bar">
      <span class="admin-page__count">共 {{ list.length }} 个分类</span>
      <div class="admin-page__spacer" />
      <el-button type="primary" @click="openCreate">新增分类</el-button>
    </div>

    <div class="admin-page__table">
      <el-table v-loading="loading" :data="list" border stripe height="100%">
        <el-table-column prop="name" label="分类名" min-width="160" show-overflow-tooltip />
        <el-table-column prop="sortOrder" label="排序值" width="100" />
        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">{{ formatAdminDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row as AdminCategory)">编辑</el-button>
            <el-button link type="danger" @click="remove(row as AdminCategory)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑分类' : '新增分类'"
      width="420px"
      :close-on-click-modal="false"
    >
      <el-form label-width="80px">
        <el-form-item label="分类名" required>
          <el-input v-model="form.name" maxlength="30" show-word-limit />
        </el-form-item>
        <el-form-item label="排序值">
          <el-input-number v-model="form.sortOrder" :min="0" :max="999" />
          <span class="admin-page__hint">数值越小越靠前</span>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
.admin-page {
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
  min-height: 0;

  &__bar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    flex: none;
  }

  &__table {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--el-bg-color);
    border: 1px solid var(--app-color-line);
    border-radius: var(--app-radius-md);
  }

  &__count {
    font-size: 13px;
    color: var(--app-color-text-secondary);
  }

  &__spacer {
    flex: 1;
  }

  &__hint {
    margin-left: 12px;
    font-size: 12px;
    color: var(--app-color-text-secondary);
  }
}
</style>
