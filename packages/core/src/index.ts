// ============================================================
// @chisha/core 统一导出入口
// 所有对外暴露的类型、函数、store、工具均在此处汇总
// 外部引用时统一使用: import { xxx } from '@chisha/core'
// ============================================================

// ---------- 类型定义 ----------
export type * from './types'           // 导出所有 type（Dish, MealTime, Cuisine 等）
export type * from './types/api'       // 请求/响应通用类型（如 ApiResponse<T>）
export * from './types/tabbar';        // 导出 TabBarItem 类型定义
export * from './constants/tabbar';    // 导出 TabBar 配置常量（CORE_TAB_BAR_CONFIG）

// ---------- 组合式函数（Composables） ----------
export { useRandomDish } from './composables/useRandomDish'
// 未来新增 composable 时，在此追加一行 export

// ---------- Pinia 状态管理 ----------
// 当有共享 store 时取消注释并导出
// export { useUserStore } from './stores/user'

// ---------- 工具函数 ----------
// export { formatCalories, getMealTimeLabel } from './utils/format'

// ---------- API 客户端 ----------
// export { createApiClient } from './api/client'


