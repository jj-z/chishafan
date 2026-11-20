<script setup lang="ts">
// 后台用户管理：搜索 + 角色/状态筛选 + 分页 + 禁用/启用 + 角色变更 + 重置密码。
// 只用 Element Plus；请求与响应统一走 shared/schemas/admin.ts（P2-11 / ADMIN-01~03）。

import { ElMessage, ElMessageBox } from 'element-plus'
import {
  adminUserListResultSchema,
  adminUserOkSchema,
  adminUserResetPasswordSchema,
  adminUserSchema,
  adminUserUpdateSchema,
} from '#shared/schemas/admin'
import type { AdminUser } from '#shared/schemas/admin'

definePageMeta({ layout: 'admin' })

usePageSeo({ title: '用户管理' })

const { session } = useAuth()
// 当前登录管理员 id：用于在表格里隐藏对自己的危险操作（服务端也会兜底拒绝）。
const currentUserId = computed(() => session.user.value?.id ?? '')

const roleLabels: Record<AdminUser['role'], string> = { USER: '普通用户', ADMIN: '管理员' }
const roleOptions = Object.entries(roleLabels).map(([value, label]) => ({ value, label }))
const statusOptions = [
  { value: 'ACTIVE', label: '正常' },
  { value: 'DISABLED', label: '已禁用' },
]

const list = ref<AdminUser[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(15)
const PAGE_SIZES = [10, 15, 20, 50]
const keyword = ref('')
const role = ref('')
const status = ref('')
const loading = ref(false)

/** 拉取当前页数据；筛选条件变化时调用方先回第 1 页，避免停在高页码得到空表。 */
async function fetchList() {
  loading.value = true
  try {
    const data = await apiFetch('/api/admin/users', adminUserListResultSchema, {
      query: {
        ...(keyword.value.trim() ? { keyword: keyword.value.trim() } : {}),
        ...(role.value ? { role: role.value } : {}),
        ...(status.value ? { status: status.value } : {}),
        page: page.value,
        pageSize: pageSize.value,
      },
    })
    list.value = data.items
    total.value = data.total
  } catch (err) {
    ElMessage.error(adminErrorMessage(err, '加载用户失败'))
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
  role.value = ''
  status.value = ''
  search()
}

/** 分页组件只负责把页码传进来，真正的数据刷新仍由 fetchList 完成。 */
function handlePageChange(next: number) {
  page.value = next
  fetchList()
}

/** 切页大小时回到第 1 页，避免停在超出最大页码的空页。 */
function handleSizeChange(next: number) {
  pageSize.value = next
  page.value = 1
  fetchList()
}

/**
 * 禁用/启用。禁用会让目标账号已登录设备立即失效（服务端自增 sessionVersion），
 * 所以必须二次确认，不能点一下就执行。
 */
async function toggleDisabled(user: AdminUser) {
  const willDisable = !user.disabledAt
  const actionText = willDisable ? '禁用' : '启用'
  const tip = willDisable
    ? '禁用后该账号无法登录，已登录设备也会立即失效；收藏与历史数据仍保留。'
    : '启用后该账号可立即恢复登录。'
  try {
    await ElMessageBox.confirm(
      `确定${actionText}账号「${user.email}」吗？${tip}`,
      `${actionText}确认`,
      {
        type: willDisable ? 'warning' : 'info',
        confirmButtonText: actionText,
        cancelButtonText: '取消',
      },
    )
  } catch {
    // 用户点「取消」时 ElMessageBox 会 reject，这里只是取消，不需要提示
    return
  }

  try {
    await apiFetch(`/api/admin/users/${user.id}`, adminUserSchema, {
      method: 'PATCH',
      body: adminUserUpdateSchema.parse({ disabled: willDisable }),
    })
    ElMessage.success(`已${actionText}`)
    fetchList()
  } catch (err) {
    ElMessage.error(adminErrorMessage(err, `${actionText}失败`))
  }
}

/** 角色变更同样影响目标账号的会话，需要二次确认。 */
async function changeRole(user: AdminUser) {
  const nextRole: AdminUser['role'] = user.role === 'ADMIN' ? 'USER' : 'ADMIN'
  try {
    await ElMessageBox.confirm(
      `确定将「${user.email}」的角色改为${roleLabels[nextRole]}吗？该账号需要重新登录后新角色才会生效。`,
      '角色变更确认',
      { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' },
    )
  } catch {
    return
  }

  try {
    await apiFetch(`/api/admin/users/${user.id}`, adminUserSchema, {
      method: 'PATCH',
      body: adminUserUpdateSchema.parse({ role: nextRole }),
    })
    ElMessage.success('角色已更新')
    fetchList()
  } catch (err) {
    ElMessage.error(adminErrorMessage(err, '角色变更失败'))
  }
}

// 重置密码弹窗：两次输入一致才允许提交，提交前再做一次二次确认（重置会让目标账号立即掉线）。
const resetDialogVisible = ref(false)
const resetting = ref(false)
const resetTarget = ref<AdminUser | null>(null)
const resetForm = reactive({ password: '', confirmPassword: '' })

/** 打开重置密码弹窗，清空上一次输入。 */
function openReset(user: AdminUser) {
  resetTarget.value = user
  resetForm.password = ''
  resetForm.confirmPassword = ''
  resetDialogVisible.value = true
}

/** 提交重置：前端先校验长度与两次输入，再弹二次确认。 */
async function submitReset() {
  const parsed = adminUserResetPasswordSchema.safeParse({ password: resetForm.password })
  if (!parsed.success) {
    ElMessage.error(parsed.error.issues[0]?.message ?? '请检查新密码')
    return
  }
  if (resetForm.password !== resetForm.confirmPassword) {
    ElMessage.error('两次输入的密码不一致')
    return
  }

  const target = resetTarget.value
  if (!target) return

  try {
    await ElMessageBox.confirm(
      `确定重置「${target.email}」的密码吗？重置后该账号所有已登录设备会立即失效，需要把新密码告知用户。`,
      '重置密码确认',
      { type: 'warning', confirmButtonText: '确定重置', cancelButtonText: '取消' },
    )
  } catch {
    return
  }

  resetting.value = true
  try {
    await apiFetch(`/api/admin/users/${target.id}/reset-password`, adminUserOkSchema, {
      method: 'POST',
      body: parsed.data,
    })
    ElMessage.success('密码已重置')
    resetDialogVisible.value = false
  } catch (err) {
    ElMessage.error(adminErrorMessage(err, '重置密码失败'))
  } finally {
    resetting.value = false
  }
}

onMounted(() => {
  fetchList()
})
</script>

<template>
  <div class="admin-page">
    <div class="admin-page__bar">
      <el-input
        v-model="keyword"
        class="admin-page__keyword"
        placeholder="搜索邮箱 / 手机号 / 昵称"
        clearable
        @keyup.enter="search"
        @clear="search"
      />
      <el-select
        v-model="role"
        class="admin-page__select"
        placeholder="全部角色"
        clearable
        @change="search"
      >
        <el-option
          v-for="opt in roleOptions"
          :key="opt.value"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>
      <el-select
        v-model="status"
        class="admin-page__select"
        placeholder="全部状态"
        clearable
        @change="search"
      >
        <el-option
          v-for="opt in statusOptions"
          :key="opt.value"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>
      <el-button type="primary" @click="search">查询</el-button>
      <el-button @click="resetSearch">重置</el-button>
    </div>

    <div class="admin-page__table">
      <el-table v-loading="loading" :data="list" border stripe height="100%">
        <el-table-column label="邮箱" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.email }}
            <el-tag v-if="row.id === currentUserId" size="small" type="info">当前账号</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="昵称" width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.nickname || '-' }}</template>
        </el-table-column>
        <el-table-column label="手机号" width="140">
          <template #default="{ row }">{{ row.phone || '-' }}</template>
        </el-table-column>
        <el-table-column label="角色" width="100">
          <template #default="{ row }">
            <el-tag :type="row.role === 'ADMIN' ? 'warning' : 'info'">
              {{ roleLabels[row.role as AdminUser['role']] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.disabledAt ? 'danger' : 'success'">
              {{ row.disabledAt ? '已禁用' : '正常' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="注册时间" width="140">
          <template #default="{ row }">{{ formatAdminDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <!-- 自己的账号不展示危险操作：服务端也会拒绝，这里提前避免误点 -->
            <template v-if="row.id !== currentUserId">
              <el-button
                link
                :type="row.disabledAt ? 'success' : 'warning'"
                @click="toggleDisabled(row as AdminUser)"
              >
                {{ row.disabledAt ? '启用' : '禁用' }}
              </el-button>
              <el-button link type="primary" @click="changeRole(row as AdminUser)">
                {{ row.role === 'ADMIN' ? '设为普通用户' : '设为管理员' }}
              </el-button>
              <el-button link type="danger" @click="openReset(row as AdminUser)"
                >重置密码</el-button
              >
            </template>
            <span v-else class="admin-page__hint">请到个人资料页修改</span>
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
      v-model="resetDialogVisible"
      title="重置密码"
      width="460px"
      :close-on-click-modal="false"
    >
      <el-form label-width="90px">
        <el-form-item label="账号">
          <span>{{ resetTarget?.email }}</span>
        </el-form-item>
        <el-form-item label="新密码" required>
          <el-input
            v-model="resetForm.password"
            type="password"
            show-password
            placeholder="至少 8 位"
          />
        </el-form-item>
        <el-form-item label="确认密码" required>
          <el-input
            v-model="resetForm.confirmPassword"
            type="password"
            show-password
            placeholder="再输入一次"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="resetting" @click="submitReset">重置密码</el-button>
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
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    flex: none;
  }

  &__keyword {
    width: 240px;
  }

  &__select {
    width: 150px;
  }

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

  &__hint {
    font-size: 12px;
    color: var(--app-color-text-secondary);
  }
}
</style>
