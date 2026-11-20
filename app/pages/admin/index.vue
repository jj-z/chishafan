<script setup lang="ts">
// 后台首页：运营数据看板（P2-12）。
// 数据来自 GET /api/admin/stats?days=7|30，接口已用 Zod 校验，这里只负责展示。
// 指标口径：总量是全量，趋势 / 热门菜 / 零结果搜索 / AI 指标取所选时间范围。

import { ElMessage } from 'element-plus'
import { adminStatsSchema } from '#shared/schemas/admin'
import type { AdminStats } from '#shared/schemas/admin'

definePageMeta({ layout: 'admin' })

usePageSeo({ title: '数据看板' })

const days = ref<7 | 30>(7)
const stats = ref<AdminStats | null>(null)
const loading = ref(false)

const rangeOptions = [
  { label: '最近 7 天', value: 7 },
  { label: '最近 30 天', value: 30 },
] as const

/** 拉取看板数据；切换时间范围与手动刷新都走这里。 */
async function fetchStats() {
  loading.value = true
  try {
    stats.value = await apiFetch('/api/admin/stats', adminStatsSchema, {
      query: { days: days.value },
    })
  } catch (err) {
    // SSR 阶段没有 document，ElMessage 会因操作 document.body 抛错并让整页 500，
    // 所以服务端只跳过提示，数据加载失败由客户端交互（切范围/刷新）时再告知。
    if (import.meta.client) ElMessage.error(adminErrorMessage(err, '加载看板数据失败'))
  } finally {
    loading.value = false
  }
}

/** 概览卡片：key 对应 totals 字段，label 是展示名。 */
const totalCards = computed(() => {
  const totals = stats.value?.totals
  return [
    { key: 'users', label: '注册用户', value: totals?.users ?? 0 },
    { key: 'dishes', label: '菜品总数', value: totals?.dishes ?? 0 },
    { key: 'publishedDishes', label: '在架菜品', value: totals?.publishedDishes ?? 0 },
    { key: 'favorites', label: '收藏记录', value: totals?.favorites ?? 0 },
    { key: 'histories', label: '就餐记录', value: totals?.histories ?? 0 },
  ]
})

// 趋势柱状图不引图表库：两组数据的最大值决定柱高比例，纯 CSS 就够用，
// 也避免为一个看板增加打包体积（P2 明确不扩技术栈）。
const trendMax = computed(() => {
  const rows = stats.value?.trend ?? []
  return Math.max(1, ...rows.map((row) => Math.max(row.histories, row.newUsers)))
})

/** 把数值换算成柱高百分比，最大值为 100%。 */
function barHeight(value: number): string {
  return `${Math.round((value / trendMax.value) * 100)}%`
}

/** MM-DD 比完整日期更适合柱状图的横轴标签。 */
function shortDate(date: string): string {
  return date.slice(5)
}

const hasTrendData = computed(() =>
  (stats.value?.trend ?? []).some((row) => row.histories > 0 || row.newUsers > 0),
)

const failureRateText = computed(() => {
  const rate = stats.value?.ai.failureRate ?? 0
  return `${(rate * 100).toFixed(1)}%`
})

await fetchStats()
</script>

<template>
  <div v-loading="loading" class="dashboard">
    <div class="dashboard__head">
      <div>
        <h2 class="dashboard__title">数据看板</h2>
        <p class="dashboard__hint">
          统计范围：{{ stats?.range.from ?? '-' }} 至 {{ stats?.range.to ?? '-' }}
        </p>
      </div>
      <div class="dashboard__actions">
        <el-radio-group v-model="days" size="small" @change="fetchStats">
          <el-radio-button v-for="item in rangeOptions" :key="item.value" :value="item.value">
            {{ item.label }}
          </el-radio-button>
        </el-radio-group>
        <el-button size="small" @click="fetchStats">刷新</el-button>
      </div>
    </div>

    <div class="dashboard__cards">
      <el-card v-for="card in totalCards" :key="card.key" shadow="never" class="stat-card">
        <p class="stat-card__label">{{ card.label }}</p>
        <p class="stat-card__value">{{ card.value }}</p>
      </el-card>
    </div>

    <el-card shadow="never" class="dashboard__panel">
      <template #header>每日趋势</template>
      <div v-if="hasTrendData" class="trend">
        <div class="trend__legend">
          <span class="trend__dot trend__dot--history" />就餐记录
          <span class="trend__dot trend__dot--user" />新增用户
        </div>
        <div class="trend__chart">
          <div v-for="row in stats?.trend ?? []" :key="row.date" class="trend__col">
            <div class="trend__bars">
              <div
                class="trend__bar trend__bar--history"
                :style="{ height: barHeight(row.histories) }"
                :title="`${row.date} 就餐 ${row.histories} 次`"
              />
              <div
                class="trend__bar trend__bar--user"
                :style="{ height: barHeight(row.newUsers) }"
                :title="`${row.date} 新增用户 ${row.newUsers} 人`"
              />
            </div>
            <span class="trend__label">{{ shortDate(row.date) }}</span>
          </div>
        </div>
      </div>
      <el-empty v-else description="所选时间段还没有就餐或注册数据" />
    </el-card>

    <div class="dashboard__grid">
      <el-card shadow="never">
        <template #header>热门菜 Top 10</template>
        <el-table :data="stats?.topDishes ?? []" size="small">
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="name" label="菜品" />
          <el-table-column prop="count" label="就餐次数" width="100" align="right" />
          <template #empty>
            <el-empty description="所选时间段还没有就餐记录" :image-size="60" />
          </template>
        </el-table>
      </el-card>

      <el-card shadow="never">
        <template #header>
          <div class="dashboard__panel-head">
            <span>零结果搜索</span>
            <span class="dashboard__panel-tip">补这些关键词对应的菜，能减少用户流失</span>
          </div>
        </template>
        <el-table :data="stats?.emptySearches ?? []" size="small">
          <el-table-column prop="keyword" label="搜索词" />
          <el-table-column prop="count" label="次数" width="100" align="right" />
          <template #empty>
            <el-empty description="所选时间段没有搜不到结果的关键词" :image-size="60" />
          </template>
        </el-table>
      </el-card>
    </div>

    <el-card shadow="never" class="dashboard__panel">
      <template #header>AI 推荐调用</template>
      <div class="dashboard__cards dashboard__cards--ai">
        <div class="stat-card stat-card--plain">
          <p class="stat-card__label">调用次数</p>
          <p class="stat-card__value">{{ stats?.ai.total ?? 0 }}</p>
        </div>
        <div class="stat-card stat-card--plain">
          <p class="stat-card__label">失败次数</p>
          <p class="stat-card__value">{{ stats?.ai.failed ?? 0 }}</p>
        </div>
        <div class="stat-card stat-card--plain">
          <p class="stat-card__label">失败率</p>
          <p class="stat-card__value">{{ failureRateText }}</p>
        </div>
        <div class="stat-card stat-card--plain">
          <p class="stat-card__label">平均耗时</p>
          <p class="stat-card__value">{{ stats?.ai.avgDurationMs ?? 0 }} ms</p>
        </div>
      </div>
    </el-card>
  </div>
</template>

<style lang="scss" scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 16px;

  &__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
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

  &__actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 16px;
  }

  &__panel-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  &__panel-tip {
    font-size: 12px;
    color: var(--app-color-text-secondary);
  }
}

.stat-card {
  &__label {
    margin: 0;
    font-size: 13px;
    color: var(--app-color-text-secondary);
  }

  &__value {
    margin: 8px 0 0;
    font-size: 24px;
    font-weight: 600;
    color: var(--app-color-primary);
  }

  &--plain {
    padding: 4px 0;
  }
}

.trend {
  &__legend {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 12px;
    font-size: 12px;
    color: var(--app-color-text-secondary);
  }

  &__dot {
    width: 8px;
    height: 8px;
    border-radius: 2px;

    &--history {
      background: var(--app-color-primary);
    }

    &--user {
      background: #f0a020;
    }
  }

  // 固定高度 + 底部对齐：柱子高度按最大值归一化，没有数据的日子也会留出空位，
  // 时间轴保持连续（不要用 flex:1 撑开，否则少数几天会把柱子拉得很粗）。
  &__chart {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    height: 180px;
    overflow-x: auto;
  }

  &__col {
    display: flex;
    flex: 1 0 28px;
    flex-direction: column;
    align-items: center;
    height: 100%;
  }

  &__bars {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    width: 100%;
    height: 100%;
  }

  &__bar {
    flex: 1;
    min-height: 2px;
    border-radius: 2px 2px 0 0;

    &--history {
      background: var(--app-color-primary);
    }

    &--user {
      background: #f0a020;
    }
  }

  &__label {
    margin-top: 6px;
    font-size: 11px;
    color: var(--app-color-text-secondary);
    white-space: nowrap;
  }
}

.dashboard__cards--ai {
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}
</style>
