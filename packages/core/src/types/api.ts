// packages/core/src/types/api.ts

/**
 * 后端统一响应格式
 * 所有 Express API 返回的 JSON 都遵循此结构
 */
export interface ApiResponse<T = unknown> {
  code: number       // 业务状态码，200 表示成功
  message: string    // 提示信息
  data: T            // 实际数据，泛型占位
}

/**
 * 分页请求参数
 */
export interface PaginationParams {
  page: number
  pageSize: number
}

/**
 * 分页响应数据
 */
export interface PaginatedData<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}