<script setup lang="ts">
// 后台操作审计（P2-13 / ADMIN-04）：只读列表 + 目标类型筛选 + 分页。
// 动作与目标类型的中文标签放在前端：接口返回枚举值，新增动作时这里漏配会显示原始值，反而便于发现遗漏。

import { ElMessage } from 'element-plus'
import { adminAuditListResultSchema } from '#shared/schemas/admin'
import type { AdminAuditLog } from '#shared/schemas/admin'

definePageMeta({ layout: 'admin' })

usePageSeo({ title: '操作审计' })

const actionLabels: Record<AdminAuditLog['action'], string> = {
  DISABLE_USER: '禁用用户',
  ENABLE_USER: '启用用户',
  CHANGE_ROLE: '变更角色',
  RESET_PASSWORD: '重置密码',
  CREATE_DISH: '新增菜品',
  UPDATE_DISH: '编辑菜品',
  DELETE_DISH: '删除菜品',
  CREATE_CATEGORY: '新增分类',
  UPDATE_CATEGORY: '编辑分类',
  DELETE_CATEGORY: '删除分类',
}

const targetTypeLabels: Record<AdminAuditLog['targetType'], string> = {
  USER: '用户',
  DISH: '菜品',
  CATEGORY: '分类',
}

const targetTypeOptions = Object.entries(targetTypeLabels).map(([value, label]) => ({
  value,
  label,
}))

// el-table 插槽里的 row 是 any（DefaultRow），直接用 row.action 索引会触发 TS7053；
// 统一收窄成 string 再查表，查不到时回退原始值。
function actionLabel(action: string): string {
  return actionLabels[action as AdminAuditLog['action']] ?? action
}

function targetTypeLabel(type: string): string {
  return targetTypeLabels[type as AdminAuditLog['targetType']] ?? type
}

const list = ref<AdminAuditLog[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const PAGE_SIZES = [20, 50, 100, 200]
const targetType = ref('')
const loading = ref(false)

/** 拉取当前页审计记录；筛选变化时调用方先回到第 1 页。 */
async function fetchList() {
  loading.value = true
  try {
    const data = await apiFetch('/api/admin/audit-logs', adminAuditListResultSchema, {
      query: {
        ...(targetType.value ? { targetType: targetType.value } : {}),
        page: page.value,
        pageSize: pageSize.value,
      },
    })
    list.value = data.items
    total.value = data.total
  } catch (err) {
    // 同 admin/index.vue：SSR 阶段无 document，ElMessage 会让整页 500，只在客户端提示。
    if (import.meta.client) ElMessage.error(adminErrorMessage(err, '加载操作记录失败'))
  } finally {
    loading.value = false
  }
}

/** 切换目标类型时先回第 1 页，避免停在超出范围的页码上看到空表。 */
function handleFilterChange() {
  page.value = 1
  fetchList()
}

/** 分页组件只负责传页码。 */
function handlePageChange(next: number) {
  page.value = next
  fetchList()
}

/** 切页大小时回到第 1 页，避免停在超出范围的空页。 */
function handleSizeChange(next: number) {
  pageSize.value = next
  page.value = 1
  fetchList()
}

/** 长 id 只展示后 6 位：完整 id 对运营没有意义，但保留可按需比对。 */
function shortId(id: string): string {
  return id.length > 8 ? `…${id.slice(-6)}` : id
}

/** 时间显示到分钟即可，审计只需要先后顺序。 */
function formatTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

await fetchList()
</script>

<template>
  <div class="audit">
    <div class="audit__head">
      <div>
        <h2 class="audit__title">操作审计</h2>
        <p class="audit__hint">记录管理员对用户、菜品、分类的写操作，按时间倒序排列。</p>
      </div>
      <el-select
        v-model="targetType"
        placeholder="全部目标类型"
        clearable
        size="small"
        class="audit__filter"
        @change="handleFilterChange"
      >
        <el-option
          v-for="item in targetTypeOptions"
          :key="item.value"
          :label="item.label"
          :value="item.value"
        />
      </el-select>
    </div>

    <div class="audit__table">
      <el-table v-loading="loading" :data="list" size="small" border height="100%">
        <el-table-column label="时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column prop="adminEmail" label="操作人" min-width="180" />
        <el-table-column label="动作" width="120">
          <template #default="{ row }">{{ actionLabel(row.action) }}</template>
        </el-table-column>
        <el-table-column label="目标" width="110">
          <template #default="{ row }">
            {{ targetTypeLabel(row.targetType) }}
          </template>
        </el-table-column>
        <el-table-column label="目标 ID" width="110">
          <template #default="{ row }">
            <el-tooltip :content="row.targetId" placement="top">
              <span class="audit__id">{{ shortId(row.targetId) }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="变更后" min-width="160">
          <template #default="{ row }">{{ row.detail || '-' }}</template>
        </el-table-column>
        <template #empty>
          <el-empty description="还没有操作记录" :image-size="80" />
        </template>
      </el-table>
    </div>

    <div class="audit__pager">
      <el-pagination
        layout="total, sizes, prev, pager, next, jumper"
        :total="total"
        :page-sizes="PAGE_SIZES"
        :page-size="pageSize"
        :current-page="page"
        @current-change="handlePageChange"
        @size-change="handleSizeChange"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.audit {
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 16px;

  &__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex: none;
  }

  &__title {
    margin: 0;
    font-size: 18px;
  }

  &__hint {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--app-color-text-secondary);
  }

  &__filter {
    width: 180px;
  }

  // 表格容器：吃满 head 与 pager 之间的高度，表格内部滚动
  &__table {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--el-bg-color);
    border: 1px solid var(--app-color-line);
    border-radius: var(--app-radius-md);
  }

  &__id {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    color: var(--app-color-text-secondary);
    cursor: default;
  }

  &__pager {
    flex: none;
    display: flex;
    justify-content: flex-end;
  }
}
</style>
